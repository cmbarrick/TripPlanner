namespace Wander.Functions;

/// <summary>
/// Queue message describing a voice note to transcribe. Mirrors the record the API publishes
/// (<c>Wander.Api.Transcription.TranscriptionJob</c>) — kept duplicated so the two deployables
/// share no assembly. Property names must match the JSON the API serializes.
/// </summary>
public record TranscriptionJob(Guid MediaAssetId, string BlobName, string? Locale = null);
