using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Media;
using Wander.Api.Models;
using Wander.Api.Realtime;
using Wander.Api.Security;
using Wander.Api.Transcription;

namespace Wander.Api.Controllers;

/// <summary>
/// Journal notes (Phase 4). Notes anchor to a trip, a day, or a specific itinerary event so the
/// itinerary timeline doubles as the journal. Voice notes upload audio to blob storage and queue
/// an asynchronous transcription job (handled by the transcription Azure Function).
/// </summary>
[ApiController]
[Route("api")]
[Authorize]
public class NotesController : ControllerBase
{
    /// <summary>Cap on uploaded audio size (~50 MB) — generous for short voice memos.</summary>
    public const long MaxAudioBytes = 50L * 1024 * 1024;

    /// <summary>Cap on uploaded photo size (~25 MB) — well above a phone JPEG.</summary>
    public const long MaxImageBytes = 25L * 1024 * 1024;

    /// <summary>How long an issued media SAS URL stays valid. Long enough to play/scrub a memo, short
    /// enough that a leaked URL expires quickly.</summary>
    private static readonly TimeSpan SasLifetime = TimeSpan.FromMinutes(30);

    private readonly INoteRepository _notes;
    private readonly IBlobStore _blobs;
    private readonly ITranscriptionQueue _queue;
    private readonly ITripAccessService _access;
    private readonly ITripRealtimeNotifier _realtime;

    public NotesController(
        INoteRepository notes,
        IBlobStore blobs,
        ITranscriptionQueue queue,
        ITripAccessService access,
        ITripRealtimeNotifier realtime)
    {
        _notes = notes;
        _blobs = blobs;
        _queue = queue;
        _access = access;
        _realtime = realtime;
    }

    [HttpGet("trips/{tripId:guid}/notes")]
    public ActionResult<IEnumerable<Note>> GetForTrip(Guid tripId)
    {
        // Notes on a shared trip are a shared comment stream: any member can read all of them.
        var (access, error) = Authorize(tripId);
        return error ?? Ok(_notes.GetAllForTrip(access!.TripId));
    }

    [HttpPost("trips/{tripId:guid}/notes")]
    public ActionResult<Note> Create(Guid tripId, [FromBody] CreateNoteRequest request)
    {
        var (_, error) = Authorize(tripId);
        if (error is not null)
            return error;

        var ownerId = User.GetUserId()!;
        if (Validate(request.Scope, request.TargetId, request.BodyText) is { } validationError)
            return BadRequest(new { error = validationError });

        var note = new Note
        {
            Scope = request.Scope,
            TargetId = request.TargetId,
            Kind = request.Kind,
            BodyText = request.BodyText,
            PromptId = request.PromptId,
            PromptText = request.PromptText,
        };

        var created = _notes.AddAuthored(tripId, ownerId, note);
        _realtime.NotifyTripChanged(tripId, "notes", ownerId);
        return Ok(created);
    }

    [HttpPost("trips/{tripId:guid}/notes/voice")]
    [RequestSizeLimit(MaxAudioBytes)]
    public async Task<ActionResult<Note>> CreateVoiceNote(
        Guid tripId,
        [FromForm] CreateVoiceNoteRequest request,
        CancellationToken ct)
    {
        var (_, authError) = Authorize(tripId);
        if (authError is not null)
            return authError;

        var ownerId = User.GetUserId()!;
        if (request.Audio is null || request.Audio.Length == 0)
            return BadRequest(new { error = "An audio file is required." });
        if (request.Audio.Length > MaxAudioBytes)
            return BadRequest(new { error = "Audio file is too large." });
        if (Validate(request.Scope, request.TargetId, request.BodyText) is { } error)
            return BadRequest(new { error });

        var mediaId = Guid.NewGuid();
        var ext = Path.GetExtension(request.Audio.FileName);
        var blobName = $"{ownerId}/{tripId}/{mediaId}{ext}";
        var contentType = string.IsNullOrWhiteSpace(request.Audio.ContentType)
            ? "application/octet-stream"
            : request.Audio.ContentType;

        await using (var stream = request.Audio.OpenReadStream())
        {
            await _blobs.SaveAsync(blobName, stream, contentType, ct);
        }

        var blobUrl = $"{blobName}"; // resolved to a full URL by the blob store on read paths
        var note = new Note
        {
            Scope = request.Scope,
            TargetId = request.TargetId,
            Kind = NoteKind.Voice,
            BodyText = request.BodyText,
            MediaAssets =
            [
                new MediaAsset
                {
                    Id = mediaId,
                    Kind = MediaAssetKind.Audio,
                    BlobName = blobName,
                    BlobUrl = blobUrl,
                    ContentType = contentType,
                    DurationSeconds = request.DurationSeconds,
                    TranscriptionStatus = TranscriptionStatus.Pending,
                },
            ],
        };

        var created = _notes.AddAuthored(tripId, ownerId, note);
        await _queue.EnqueueAsync(new TranscriptionJob(mediaId, blobName, request.Locale), ct);
        _realtime.NotifyTripChanged(tripId, "notes", ownerId);
        return Ok(created);
    }

    [HttpPost("trips/{tripId:guid}/notes/photo")]
    [RequestSizeLimit(MaxImageBytes)]
    public async Task<ActionResult<Note>> CreatePhotoNote(
        Guid tripId,
        [FromForm] CreatePhotoNoteRequest request,
        CancellationToken ct)
    {
        var (_, authError) = Authorize(tripId);
        if (authError is not null)
            return authError;

        var ownerId = User.GetUserId()!;
        if (request.Image is null || request.Image.Length == 0)
            return BadRequest(new { error = "An image file is required." });
        if (request.Image.Length > MaxImageBytes)
            return BadRequest(new { error = "Image file is too large." });
        if (Validate(request.Scope, request.TargetId, request.BodyText) is { } error)
            return BadRequest(new { error });

        var mediaId = Guid.NewGuid();
        var ext = Path.GetExtension(request.Image.FileName);
        var blobName = $"{ownerId}/{tripId}/{mediaId}{ext}";
        var contentType = string.IsNullOrWhiteSpace(request.Image.ContentType)
            ? "image/jpeg"
            : request.Image.ContentType;

        await using (var stream = request.Image.OpenReadStream())
        {
            await _blobs.SaveAsync(blobName, stream, contentType, ct);
        }

        var note = new Note
        {
            Scope = request.Scope,
            TargetId = request.TargetId,
            Kind = NoteKind.Text,
            BodyText = request.BodyText,
            MediaAssets =
            [
                new MediaAsset
                {
                    Id = mediaId,
                    Kind = MediaAssetKind.Photo,
                    BlobName = blobName,
                    BlobUrl = blobName,
                    ContentType = contentType,
                    TranscriptionStatus = TranscriptionStatus.None,
                },
            ],
        };

        var created = _notes.AddAuthored(tripId, ownerId, note);
        _realtime.NotifyTripChanged(tripId, "notes", ownerId);
        return Ok(created);
    }

    [HttpGet("trips/{tripId:guid}/notes/media/{mediaAssetId:guid}")]
    public async Task<IActionResult> GetMedia(Guid tripId, Guid mediaAssetId, CancellationToken ct)
    {
        var asset = AuthorizeMedia(mediaAssetId);
        if (asset is null)
            return NotFound();

        Stream stream;
        try
        {
            stream = await _blobs.OpenReadAsync(asset.BlobName, ct);
        }
        catch (FileNotFoundException)
        {
            return NotFound();
        }

        // Range processing enables seeking/scrubbing in audio players.
        return File(stream, asset.ContentType ?? "application/octet-stream", enableRangeProcessing: true);
    }

    /// <summary>
    /// Resolves a short-lived signed URL for a media asset so clients can fetch it directly from
    /// storage (offloading bandwidth from the API). Returns 200 with the URL when the store can
    /// sign one; 204 No Content when it can't (local dev / non-signing credential), signalling the
    /// client to fall back to the authenticated streaming endpoint above.
    /// </summary>
    [HttpGet("trips/{tripId:guid}/notes/media/{mediaAssetId:guid}/sas")]
    public async Task<IActionResult> GetMediaSas(Guid tripId, Guid mediaAssetId, CancellationToken ct)
    {
        var asset = AuthorizeMedia(mediaAssetId);
        if (asset is null)
            return NotFound();

        var uri = await _blobs.TryGetReadSasUriAsync(asset.BlobName, SasLifetime, ct);
        if (uri is null)
            return NoContent();

        return Ok(new MediaSasResponse(uri.ToString(), DateTimeOffset.UtcNow.Add(SasLifetime)));
    }

    [HttpPut("notes/{noteId:guid}")]
    public ActionResult<Note> Update(Guid noteId, [FromBody] UpdateNoteRequest request)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        if (request.BodyText is { Length: > Note.MaxBodyLength })
            return BadRequest(new { error = $"Note body cannot exceed {Note.MaxBodyLength} characters." });

        Note? updated;
        try
        {
            updated = _notes.UpdateBody(noteId, ownerId, request.BodyText, request.Version);
        }
        catch (ConcurrencyConflictException ex)
        {
            return Conflict(new { title = ex.Message });
        }
        if (updated is null)
            return NotFound();

        _realtime.NotifyTripChanged(updated.TripId, "notes", ownerId);
        return Ok(updated);
    }

    [HttpDelete("notes/{noteId:guid}")]
    public IActionResult Delete(Guid noteId)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        // Capture the trip before deletion so we can broadcast the change to co-editors.
        var tripId = _notes.GetTripIdForNote(noteId, ownerId);
        if (!_notes.Delete(noteId, ownerId))
            return NotFound();

        if (tripId is { } id)
            _realtime.NotifyTripChanged(id, "notes", ownerId);
        return NoContent();
    }

    /// <summary>Resolves the caller's access to a trip; NotFound when there's no access at all.</summary>
    private (TripAccess? access, ActionResult? error) Authorize(Guid tripId)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return (null, Unauthorized());

        var access = _access.Resolve(tripId, ownerId);
        return access is null ? (null, NotFound()) : (access, null);
    }

    /// <summary>Returns the media asset only when the caller has access to its trip (any member).</summary>
    private MediaAsset? AuthorizeMedia(Guid mediaAssetId)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return null;

        var asset = _notes.GetMediaAsset(mediaAssetId);
        if (asset is null)
            return null;

        var tripId = _notes.GetTripIdForMediaAsset(mediaAssetId);
        if (tripId is null || _access.Resolve(tripId.Value, ownerId) is null)
            return null;

        return asset;
    }

    /// <summary>Shared scope/body validation; returns an error message or null when valid.</summary>
    private static string? Validate(NoteScope scope, Guid? targetId, string? body)
    {
        if (scope != NoteScope.Trip && targetId is null)
            return "TargetId is required for day- and event-scoped notes.";
        if (body is { Length: > Note.MaxBodyLength })
            return $"Note body cannot exceed {Note.MaxBodyLength} characters.";
        return null;
    }
}

public record CreateNoteRequest(
    NoteScope Scope,
    Guid? TargetId,
    NoteKind Kind,
    string? BodyText,
    Guid? PromptId,
    string? PromptText = null);

/// <summary>Note edit. <see cref="Version"/> is the concurrency token from the note the client last
/// read; defaults to 0 for older/untyped clients, which will only ever collide with a genuinely
/// concurrent edit (see <see cref="Wander.Api.Data.ConcurrencyConflictException"/>).</summary>
public record UpdateNoteRequest(string? BodyText, uint Version = 0);

/// <summary>A signed, time-limited direct URL for a media asset.</summary>
public record MediaSasResponse(string Url, DateTimeOffset ExpiresAt);

public class CreateVoiceNoteRequest
{
    public NoteScope Scope { get; set; } = NoteScope.Trip;
    public Guid? TargetId { get; set; }
    public string? BodyText { get; set; }
    public int? DurationSeconds { get; set; }
    public string? Locale { get; set; }
    public IFormFile? Audio { get; set; }
}

public class CreatePhotoNoteRequest
{
    public NoteScope Scope { get; set; } = NoteScope.Trip;
    public Guid? TargetId { get; set; }
    public string? BodyText { get; set; }
    public IFormFile? Image { get; set; }
}
