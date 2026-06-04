using Microsoft.Extensions.Logging;

namespace Wander.Api.Transcription;

/// <summary>No-op transcription queue for local/CI (no Azure Storage). The audio is still stored;
/// it simply isn't transcribed until the app runs against a real queue + transcription Function.</summary>
public sealed class NullTranscriptionQueue : ITranscriptionQueue
{
    private readonly ILogger<NullTranscriptionQueue> _log;

    public NullTranscriptionQueue(ILogger<NullTranscriptionQueue> log) => _log = log;

    public Task EnqueueAsync(TranscriptionJob job, CancellationToken ct)
    {
        _log.LogInformation(
            "Transcription queue is disabled (no Storage:ConnectionString); skipping job for media {MediaAssetId}.",
            job.MediaAssetId);
        return Task.CompletedTask;
    }
}
