using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Media;
using Wander.Api.Models;
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

    private readonly INoteRepository _notes;
    private readonly IBlobStore _blobs;
    private readonly ITranscriptionQueue _queue;

    public NotesController(INoteRepository notes, IBlobStore blobs, ITranscriptionQueue queue)
    {
        _notes = notes;
        _blobs = blobs;
        _queue = queue;
    }

    [HttpGet("trips/{tripId:guid}/notes")]
    public ActionResult<IEnumerable<Note>> GetForTrip(Guid tripId)
    {
        var ownerId = User.GetUserId();
        return ownerId is null ? Unauthorized() : Ok(_notes.GetForTrip(tripId, ownerId));
    }

    [HttpPost("trips/{tripId:guid}/notes")]
    public ActionResult<Note> Create(Guid tripId, [FromBody] CreateNoteRequest request)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        if (Validate(request.Scope, request.TargetId, request.BodyText) is { } error)
            return BadRequest(new { error });

        var note = new Note
        {
            Scope = request.Scope,
            TargetId = request.TargetId,
            Kind = request.Kind,
            BodyText = request.BodyText,
            PromptId = request.PromptId,
        };

        var created = _notes.Add(tripId, ownerId, note);
        return created is null ? NotFound() : Ok(created);
    }

    [HttpPost("trips/{tripId:guid}/notes/voice")]
    [RequestSizeLimit(MaxAudioBytes)]
    public async Task<ActionResult<Note>> CreateVoiceNote(
        Guid tripId,
        [FromForm] CreateVoiceNoteRequest request,
        CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

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

        var created = _notes.Add(tripId, ownerId, note);
        if (created is null)
            return NotFound();

        await _queue.EnqueueAsync(new TranscriptionJob(mediaId, blobName, request.Locale), ct);
        return Ok(created);
    }

    [HttpDelete("notes/{noteId:guid}")]
    public IActionResult Delete(Guid noteId)
    {
        var ownerId = User.GetUserId();
        return ownerId is null
            ? Unauthorized()
            : (_notes.Delete(noteId, ownerId) ? NoContent() : NotFound());
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
    Guid? PromptId);

public class CreateVoiceNoteRequest
{
    public NoteScope Scope { get; set; } = NoteScope.Trip;
    public Guid? TargetId { get; set; }
    public string? BodyText { get; set; }
    public int? DurationSeconds { get; set; }
    public string? Locale { get; set; }
    public IFormFile? Audio { get; set; }
}
