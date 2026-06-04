using System.Text.Json.Serialization;

namespace Wander.Api.Models;

/// <summary>The kind of media attached to a note.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum MediaAssetKind
{
    Audio,
    Photo
}

/// <summary>Lifecycle of a voice note's transcription job (audio assets only).</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum TranscriptionStatus
{
    /// <summary>Not an audio asset, or transcription not requested.</summary>
    None,
    /// <summary>Audio stored; a transcription job has been queued.</summary>
    Pending,
    /// <summary>Transcript produced and stored.</summary>
    Completed,
    /// <summary>Transcription failed; audio is still kept.</summary>
    Failed
}

/// <summary>
/// A binary asset (audio or photo) attached to a <see cref="Note"/>. The bytes live in Blob
/// storage (<see cref="BlobName"/> / <see cref="BlobUrl"/>); for audio we also keep the
/// <see cref="Transcript"/> produced asynchronously by the transcription Azure Function.
/// </summary>
public class MediaAsset
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid NoteId { get; set; }

    public string OwnerId { get; set; } = string.Empty;

    public MediaAssetKind Kind { get; set; }

    /// <summary>Path/name of the blob within the media container.</summary>
    public string BlobName { get; set; } = string.Empty;

    /// <summary>Resolvable URL to the blob (SAS or public, depending on container access).</summary>
    public string? BlobUrl { get; set; }

    public string? ContentType { get; set; }

    /// <summary>Audio length in seconds, when known (supplied by the client at upload).</summary>
    public int? DurationSeconds { get; set; }

    /// <summary>Transcript text for audio assets, filled in asynchronously after upload.</summary>
    public string? Transcript { get; set; }

    public TranscriptionStatus TranscriptionStatus { get; set; } = TranscriptionStatus.None;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
