namespace Wander.Api.Media;

/// <summary>Abstraction over media (audio/photo) blob storage so the API stays local-first:
/// a filesystem-backed store in dev/CI, Azure Blob Storage in the cloud.</summary>
public interface IBlobStore
{
    /// <summary>Stores <paramref name="content"/> under <paramref name="blobName"/> and returns its name + URL.</summary>
    Task<BlobResult> SaveAsync(string blobName, Stream content, string contentType, CancellationToken ct);

    /// <summary>Opens a readable stream over a stored blob (used to stream media back to the client).</summary>
    Task<Stream> OpenReadAsync(string blobName, CancellationToken ct);

    /// <summary>
    /// Tries to mint a short-lived, read-only direct URL (e.g. an Azure SAS) so the client can
    /// fetch media straight from storage instead of streaming through the API. Returns <c>null</c>
    /// when the store can't issue one (the local dev store, or an Azure store whose credential can't
    /// sign a SAS); callers fall back to the authenticated streaming endpoint.
    /// </summary>
    Task<Uri?> TryGetReadSasUriAsync(string blobName, TimeSpan validFor, CancellationToken ct);
}

/// <summary>The stored blob's name and a resolvable URL.</summary>
public record BlobResult(string BlobName, string Url);
