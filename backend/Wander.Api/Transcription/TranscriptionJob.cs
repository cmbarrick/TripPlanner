namespace Wander.Api.Transcription;

/// <summary>
/// Message handed to the transcription Azure Function: which media asset to transcribe and where
/// its audio lives. This is a small, stable contract — an identical record exists in
/// <c>Wander.Functions</c> so the two projects stay decoupled (no shared assembly).
/// </summary>
public record TranscriptionJob(Guid MediaAssetId, string BlobName, string? Locale = null);
