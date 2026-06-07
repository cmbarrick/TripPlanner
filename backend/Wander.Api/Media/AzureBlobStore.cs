using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;

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

    public async Task<Stream> OpenReadAsync(string blobName, CancellationToken ct)
    {
        var blob = _container.GetBlobClient(blobName);
        return await blob.OpenReadAsync(position: 0, cancellationToken: ct);
    }

    public Task<Uri?> TryGetReadSasUriAsync(string blobName, TimeSpan validFor, CancellationToken ct)
    {
        var blob = _container.GetBlobClient(blobName);
        // Only possible when the client carries a shared key (connection string with AccountKey).
        // Managed-identity / SAS-based credentials can't sign here, so we fall back to streaming.
        if (!blob.CanGenerateSasUri)
            return Task.FromResult<Uri?>(null);

        var builder = new BlobSasBuilder(BlobSasPermissions.Read, DateTimeOffset.UtcNow.Add(validFor))
        {
            BlobContainerName = blob.BlobContainerName,
            BlobName = blob.Name,
            Resource = "b",
        };
        // Small clock-skew cushion so a freshly minted SAS isn't rejected as not-yet-valid.
        builder.StartsOn = DateTimeOffset.UtcNow.AddMinutes(-5);
        return Task.FromResult<Uri?>(blob.GenerateSasUri(builder));
    }
}
