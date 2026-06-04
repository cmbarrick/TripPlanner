using System.Text.Json;
using Azure.Storage.Queues;

namespace Wander.Api.Transcription;

/// <summary>Publishes transcription jobs to an Azure Storage queue consumed by the transcription
/// Function. Messages are Base64-encoded to match the Azure Functions queue trigger's default.</summary>
public sealed class AzureStorageTranscriptionQueue : ITranscriptionQueue
{
    public const string QueueName = "transcription-jobs";

    private readonly QueueClient _queue;

    public AzureStorageTranscriptionQueue(string connectionString)
    {
        _queue = new QueueClient(
            connectionString,
            QueueName,
            new QueueClientOptions { MessageEncoding = QueueMessageEncoding.Base64 });
    }

    public async Task EnqueueAsync(TranscriptionJob job, CancellationToken ct)
    {
        await _queue.CreateIfNotExistsAsync(cancellationToken: ct);
        var json = JsonSerializer.Serialize(job);
        await _queue.SendMessageAsync(json, ct);
    }
}
