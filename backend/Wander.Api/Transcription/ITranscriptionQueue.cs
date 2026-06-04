namespace Wander.Api.Transcription;

/// <summary>Enqueues audio for asynchronous transcription. Backed by an Azure Storage queue in the
/// cloud (consumed by the transcription Function); a no-op in local/CI.</summary>
public interface ITranscriptionQueue
{
    Task EnqueueAsync(TranscriptionJob job, CancellationToken ct);
}
