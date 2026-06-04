namespace Wander.Api.Media;

/// <summary>Abstraction over media (audio/photo) blob storage so the API stays local-first:
/// a filesystem-backed store in dev/CI, Azure Blob Storage in the cloud.</summary>
public interface IBlobStore
{
    /// <summary>Stores <paramref name="content"/> under <paramref name="blobName"/> and returns its name + URL.</summary>
    Task<BlobResult> SaveAsync(string blobName, Stream content, string contentType, CancellationToken ct);
}

/// <summary>The stored blob's name and a resolvable URL.</summary>
public record BlobResult(string BlobName, string Url);
