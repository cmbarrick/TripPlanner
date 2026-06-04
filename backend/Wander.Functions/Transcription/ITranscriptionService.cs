namespace Wander.Functions.Transcription;

/// <summary>Turns an audio stream into a transcript. Implemented over Azure AI Speech; behind an
/// interface so the engine can be swapped or mocked in tests.</summary>
public interface ITranscriptionService
{
    Task<string> TranscribeAsync(Stream audio, string fileName, string locale, CancellationToken ct);
}
