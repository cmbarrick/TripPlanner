using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>
/// Keeps <see cref="EmbeddingChunk"/> rows in sync with a public recap's discoverability (Phase 8,
/// Slice 2). Indexing runs synchronously on the publish/approve path today; a true async worker
/// (Azure Function, matching the transcription/recap job pattern) is a future optimization once
/// embedding latency or corpus size makes the inline call worth moving off the request path.
/// </summary>
public interface ISearchIndexService
{
    /// <summary>(Re)embeds a public recap and upserts its chunk. No-op if the recap doesn't exist.</summary>
    Task IndexAsync(Guid publicRecapId, CancellationToken ct = default);

    /// <summary>Removes a public recap's chunk, if any (unpublish, reject, or report-pending).</summary>
    Task RemoveAsync(Guid publicRecapId, CancellationToken ct = default);
}

public class SearchIndexService(WanderDbContext db, IEmbeddingProvider embeddings) : ISearchIndexService
{
    public async Task IndexAsync(Guid publicRecapId, CancellationToken ct = default)
    {
        var publicRecap = await db.PublicRecaps.AsNoTracking()
            .SingleOrDefaultAsync(p => p.Id == publicRecapId, ct);
        if (publicRecap is null)
            return;

        var recap = await db.Recaps.AsNoTracking()
            .SingleOrDefaultAsync(r => r.Id == publicRecap.RecapId, ct);
        if (recap is null)
            return;

        var text = $"{recap.Title}\n\n{recap.Body}";
        var vector = await embeddings.EmbedAsync(text, ct);

        var chunk = await db.EmbeddingChunks.SingleOrDefaultAsync(
            e => e.Source == EmbeddingSource.PublicRecap && e.SourceId == publicRecapId, ct);
        var now = DateTimeOffset.UtcNow;
        if (chunk is null)
        {
            chunk = new EmbeddingChunk
            {
                Source = EmbeddingSource.PublicRecap,
                SourceId = publicRecapId,
                TripId = publicRecap.TripId,
                CreatedAt = now,
            };
            db.EmbeddingChunks.Add(chunk);
        }

        chunk.Text = text;
        chunk.Vector = vector;
        chunk.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
    }

    public async Task RemoveAsync(Guid publicRecapId, CancellationToken ct = default)
    {
        var chunk = await db.EmbeddingChunks.SingleOrDefaultAsync(
            e => e.Source == EmbeddingSource.PublicRecap && e.SourceId == publicRecapId, ct);
        if (chunk is null)
            return;

        db.EmbeddingChunks.Remove(chunk);
        await db.SaveChangesAsync(ct);
    }
}
