using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

public record SearchQuery(
    string? Text = null,
    string? Place = null,
    string? Tag = null,
    string? Season = null,
    string? BudgetBand = null,
    int Take = 20);

public record SearchResultDto(
    Guid PublicRecapId,
    Guid RecapId,
    Guid TripId,
    string Title,
    string Snippet,
    IReadOnlyList<string> Places,
    IReadOnlyList<string> Tags,
    string? Season,
    string? BudgetBand,
    DateTimeOffset PublishedAt,
    double? Relevance);

/// <summary>
/// Search over approved public recaps (Phase 8, Slice 2): facet filters (place/tag/season/budget)
/// always apply; free-text <see cref="SearchQuery.Text"/> ranks by semantic similarity against the
/// recap's indexed <see cref="EmbeddingChunk"/>, falling back to a keyword contains-match for any
/// approved recap that hasn't been indexed yet. Similarity is computed client-side (see
/// <see cref="CosineSimilarity"/>) rather than pushed into SQL, so this runs identically against the
/// EF Core in-memory provider (tests) and Postgres (prod) — no vector-specific SQL translation to
/// diverge between them. Fine at today's corpus size; a real ANN index is a future optimization.
/// </summary>
public interface ISearchService
{
    Task<IReadOnlyList<SearchResultDto>> SearchAsync(SearchQuery query, CancellationToken ct = default);
}

public class SearchService(WanderDbContext db, IEmbeddingProvider embeddings) : ISearchService
{
    public async Task<IReadOnlyList<SearchResultDto>> SearchAsync(SearchQuery query, CancellationToken ct = default)
    {
        var take = query.Take is > 0 and <= 50 ? query.Take : 20;

        // Facet filters run client-side after the scalar (translatable-everywhere) DB filter:
        // matching inside a List<string> column with a case-insensitive comparison doesn't
        // translate on the EF Core in-memory provider (used in tests), and the corpus size here
        // doesn't warrant pushing it into SQL.
        var approved = await db.PublicRecaps.AsNoTracking()
            .Where(p => p.DeletedAt == null && p.ModerationStatus == ModerationStatus.Approved)
            .ToListAsync(ct);

        var publicRecaps = approved.Where(p =>
                MatchesFacet(query.Place, p.Places) &&
                MatchesFacet(query.Tag, p.Tags) &&
                MatchesFacet(query.Season, p.Season) &&
                MatchesFacet(query.BudgetBand, p.BudgetBand))
            .ToList();
        if (publicRecaps.Count == 0)
            return [];

        var recapIds = publicRecaps.Select(p => p.RecapId).ToList();
        var recapsById = await db.Recaps.AsNoTracking()
            .Where(r => recapIds.Contains(r.Id))
            .ToDictionaryAsync(r => r.Id, ct);

        if (string.IsNullOrWhiteSpace(query.Text))
        {
            return publicRecaps
                .OrderByDescending(p => p.PublishedAt)
                .Take(take)
                .Select(p => ToDto(p, recapsById.GetValueOrDefault(p.RecapId), null))
                .ToList();
        }

        var queryVector = await embeddings.EmbedAsync(query.Text, ct);
        var publicRecapIds = publicRecaps.Select(p => p.Id).ToList();
        var chunksById = await db.EmbeddingChunks.AsNoTracking()
            .Where(e => e.Source == EmbeddingSource.PublicRecap && publicRecapIds.Contains(e.SourceId))
            .ToDictionaryAsync(e => e.SourceId, ct);

        return publicRecaps
            .Select(p => new
            {
                PublicRecap = p,
                Recap = recapsById.GetValueOrDefault(p.RecapId),
                Similarity = chunksById.TryGetValue(p.Id, out var chunk)
                    ? CosineSimilarity(queryVector, chunk.Vector)
                    : (double?)null,
            })
            // A recap without an indexed chunk (shouldn't normally happen — indexing runs on
            // approve/publish) still surfaces via a plain keyword match rather than disappearing.
            .Where(x => x.Similarity is not null || KeywordMatches(x.Recap, query.Text))
            .OrderByDescending(x => x.Similarity ?? -1)
            .ThenByDescending(x => x.PublicRecap.PublishedAt)
            .Take(take)
            .Select(x => ToDto(x.PublicRecap, x.Recap, x.Similarity))
            .ToList();
    }

    private static bool KeywordMatches(Recap? recap, string text) =>
        recap is not null &&
        (recap.Title.Contains(text, StringComparison.OrdinalIgnoreCase) ||
         recap.Body.Contains(text, StringComparison.OrdinalIgnoreCase));

    private static bool MatchesFacet(string? filter, string? value) =>
        string.IsNullOrWhiteSpace(filter) ||
        (value is not null && string.Equals(value, filter, StringComparison.OrdinalIgnoreCase));

    private static bool MatchesFacet(string? filter, IReadOnlyList<string> values) =>
        string.IsNullOrWhiteSpace(filter) ||
        values.Any(v => string.Equals(v, filter, StringComparison.OrdinalIgnoreCase));

    private static double CosineSimilarity(float[] a, float[] b)
    {
        if (a.Length == 0 || a.Length != b.Length)
            return 0;

        double dot = 0, normA = 0, normB = 0;
        for (var i = 0; i < a.Length; i++)
        {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return normA == 0 || normB == 0 ? 0 : dot / (Math.Sqrt(normA) * Math.Sqrt(normB));
    }

    private static SearchResultDto ToDto(PublicRecap p, Recap? recap, double? relevance) => new(
        p.Id, p.RecapId, p.TripId,
        recap?.Title ?? "(untitled)",
        Snippet(recap?.Body),
        p.Places, p.Tags, p.Season, p.BudgetBand, p.PublishedAt, relevance);

    private static string Snippet(string? body)
    {
        if (string.IsNullOrWhiteSpace(body))
            return string.Empty;

        var plain = body.Replace("\r", "").Replace("\n", " ").Replace("#", "").Trim();
        return plain.Length <= 220 ? plain : plain[..220] + "…";
    }
}
