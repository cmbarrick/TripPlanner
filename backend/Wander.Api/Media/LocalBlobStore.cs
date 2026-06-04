namespace Wander.Api.Media;

/// <summary>
/// Local-first / CI blob store: persists media under a directory on disk so the app runs with no
/// Azure Storage dependency. Returns a <c>file://</c> URL. Not for production (use
/// <see cref="AzureBlobStore"/> when <c>Storage:ConnectionString</c> is configured).
/// </summary>
public sealed class LocalBlobStore : IBlobStore
{
    private readonly string _root;

    public LocalBlobStore(string root)
    {
        _root = root;
        Directory.CreateDirectory(_root);
    }

    public async Task<BlobResult> SaveAsync(string blobName, Stream content, string contentType, CancellationToken ct)
    {
        var relative = blobName.Replace('/', Path.DirectorySeparatorChar);
        var path = Path.Combine(_root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        await using var fs = File.Create(path);
        await content.CopyToAsync(fs, ct);

        return new BlobResult(blobName, new Uri(path).AbsoluteUri);
    }
}
