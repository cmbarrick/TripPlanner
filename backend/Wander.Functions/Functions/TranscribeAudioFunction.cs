using System.Text;
using System.Text.Json;
using Azure.Storage.Blobs;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Wander.Functions.Transcription;

namespace Wander.Functions;

/// <summary>
/// Drains the <c>transcription-jobs</c> queue (one message per uploaded voice note), downloads the
/// audio from blob storage, transcribes it with Azure AI Speech, and posts the transcript back to
/// the API's service-to-service callback. Failures bubble up so the Functions host retries and,
/// after the configured attempts, moves the message to the poison queue.
/// </summary>
public class TranscribeAudioFunction
{
    private readonly ITranscriptionService _transcription;
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<TranscribeAudioFunction> _log;

    public TranscribeAudioFunction(
        ITranscriptionService transcription,
        IConfiguration config,
        IHttpClientFactory httpFactory,
        ILogger<TranscribeAudioFunction> log)
    {
        _transcription = transcription;
        _config = config;
        _httpFactory = httpFactory;
        _log = log;
    }

    [Function("TranscribeAudio")]
    public async Task Run(
        [QueueTrigger("transcription-jobs", Connection = "MediaStorage")] TranscriptionJob job,
        CancellationToken ct)
    {
        _log.LogInformation("Transcribing media {MediaAssetId} from blob {BlobName}", job.MediaAssetId, job.BlobName);

        var storageConnection = _config["MediaStorage"]
            ?? throw new InvalidOperationException("MediaStorage connection string is not configured.");
        var container = _config["Storage:MediaContainer"] ?? "media";
        var locale = string.IsNullOrWhiteSpace(job.Locale) ? "en-US" : job.Locale!;

        try
        {
            var blob = new BlobContainerClient(storageConnection, container).GetBlobClient(job.BlobName);
            await using var audio = await blob.OpenReadAsync(position: 0, cancellationToken: ct);
            var transcript = await _transcription.TranscribeAsync(audio, Path.GetFileName(job.BlobName), locale, ct);

            await PostTranscriptAsync(job.MediaAssetId, transcript, success: true, ct);
            _log.LogInformation("Transcribed media {MediaAssetId} ({Length} chars)", job.MediaAssetId, transcript.Length);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Transcription failed for media {MediaAssetId}", job.MediaAssetId);
            // Best-effort: mark the asset failed so the UI can surface "transcription unavailable".
            // Then rethrow so the host applies its retry/poison-queue policy.
            await TryPostFailureAsync(job.MediaAssetId, ct);
            throw;
        }
    }

    private async Task PostTranscriptAsync(Guid mediaAssetId, string transcript, bool success, CancellationToken ct)
    {
        var apiBase = (_config["Api:BaseUrl"] ?? string.Empty).TrimEnd('/');
        var callbackKey = _config["Api:CallbackKey"] ?? string.Empty;
        if (string.IsNullOrEmpty(apiBase) || string.IsNullOrEmpty(callbackKey))
            throw new InvalidOperationException("Api:BaseUrl and Api:CallbackKey must be configured.");

        var payload = JsonSerializer.Serialize(new { transcript, success });
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"{apiBase}/internal/media-assets/{mediaAssetId}/transcript")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("X-Functions-Callback-Key", callbackKey);

        var http = _httpFactory.CreateClient();
        using var response = await http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
    }

    private async Task TryPostFailureAsync(Guid mediaAssetId, CancellationToken ct)
    {
        try
        {
            await PostTranscriptAsync(mediaAssetId, string.Empty, success: false, ct);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Could not report transcription failure for media {MediaAssetId}", mediaAssetId);
        }
    }
}
