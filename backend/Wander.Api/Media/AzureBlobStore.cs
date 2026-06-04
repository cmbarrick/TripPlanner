using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace Wander.Api.Media;

/// <summary>Azure Blob Storage-backed media store, used in the cloud when
/// <c>Storage:ConnectionString</c> is configured.</summary>
public sealed class AzureBlobStore : IBlobStore
{
    private readonly BlobContainerClient _container;

    public AzureBlobStore(string connectionString, string containerName)
    {
        _container = new BlobContainerClient(connectionString, containerName);
    }

    public async Task<BlobResult> SaveAsync(string blobName, Stream content, string contentType, CancellationToken ct)
    {
        await _container.CreateIfNotExistsAsync(cancellationToken: ct);
        var blob = _container.GetBlobClient(blobName);
        await blob.UploadAsync(
            content,
            new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = contentType } },
            ct);
        return new BlobResult(blobName, blob.Uri.ToString());
    }
}
