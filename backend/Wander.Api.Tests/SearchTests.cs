using Microsoft.EntityFrameworkCore;
using Wander.Api.Data;
using Wander.Api.Models;

namespace Wander.Api.Tests;

/// <summary>
/// Phase 8 (Slice 2): search over approved public recaps — facet filters, keyword fallback, and
/// semantic ranking against the fake (deterministic) embedding provider.
/// </summary>
public class SearchTests
{
    private const string OwnerId = "owner-user";

    private static WanderDbContext NewContext() =>
        new(new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .EnableSensitiveDataLogging()
            .Options);

    private static PublicRecap SeedApprovedRecap(
        WanderDbContext ctx, string title, string body,
        string[]? places = null, string[]? tags = null, string? season = null, string? budgetBand = null)
    {
        var now = DateTimeOffset.UtcNow;
        var trip = new EfCoreTripRepository(ctx).Add(new Trip
        {
            OwnerId = OwnerId,
            Title = title,
            Destination = "Somewhere",
            StartDate = new DateOnly(2026, 1, 1),
            EndDate = new DateOnly(2026, 1, 5),
            Travelers = 1,
            CoverTheme = "default",
            EstimatedCost = 100m,
            Currency = "USD",
            Days = [new Day { DayNumber = 1, Date = new DateOnly(2026, 1, 1) }],
        });
        var recap = new Recap { TripId = trip.Id, OwnerId = OwnerId, Title = title, Body = body, SourceFingerprint = "fp" };
        ctx.Recaps.Add(recap);

        var publicRecap = new PublicRecap
        {
            RecapId = recap.Id,
            TripId = trip.Id,
            OwnerId = OwnerId,
            ModerationStatus = ModerationStatus.Approved,
            Places = places?.ToList() ?? [],
            Tags = tags?.ToList() ?? [],
            Season = season,
            BudgetBand = budgetBand,
            PublishedAt = now,
            CreatedAt = now,
        };
        ctx.PublicRecaps.Add(publicRecap);
        ctx.SaveChanges();
        return publicRecap;
    }

    // ---- SearchIndexService --------------------------------------------------

    [Fact]
    public async Task IndexAsync_CreatesChunk_RemoveAsync_DeletesIt()
    {
        using var ctx = NewContext();
        var publicRecap = SeedApprovedRecap(ctx, "Kyoto in autumn", "Beautiful temples and maple leaves.");
        var index = new SearchIndexService(ctx, new FakeEmbeddingProvider());

        await index.IndexAsync(publicRecap.Id);
        Assert.Single(ctx.EmbeddingChunks);

        await index.RemoveAsync(publicRecap.Id);
        Assert.Empty(ctx.EmbeddingChunks);
    }

    [Fact]
    public async Task IndexAsync_Reindexing_UpdatesRatherThanDuplicates()
    {
        using var ctx = NewContext();
        var publicRecap = SeedApprovedRecap(ctx, "Kyoto in autumn", "Beautiful temples.");
        var index = new SearchIndexService(ctx, new FakeEmbeddingProvider());

        await index.IndexAsync(publicRecap.Id);
        await index.IndexAsync(publicRecap.Id);

        Assert.Single(ctx.EmbeddingChunks);
    }

    // ---- FakeEmbeddingProvider -------------------------------------------------

    [Fact]
    public async Task FakeEmbeddingProvider_SimilarText_IsCloserThanUnrelatedText()
    {
        var provider = new FakeEmbeddingProvider();
        var a = await provider.EmbedAsync("hiking mountains alps switzerland snow");
        var b = await provider.EmbedAsync("hiking alps mountains switzerland trails");
        var c = await provider.EmbedAsync("beach cocktails resort relaxing sunshine");

        static double Dot(float[] x, float[] y) => x.Zip(y, (p, q) => (double)p * q).Sum();

        var simAB = Dot(a, b);
        var simAC = Dot(a, c);
        Assert.True(simAB > simAC, $"expected similar text to score higher ({simAB} vs {simAC})");
    }

    // ---- SearchService: facets --------------------------------------------------

    [Fact]
    public async Task SearchAsync_NoFilters_ReturnsApprovedNewestFirst()
    {
        using var ctx = NewContext();
        SeedApprovedRecap(ctx, "First", "body one");
        await Task.Delay(5);
        SeedApprovedRecap(ctx, "Second", "body two");
        var svc = new SearchService(ctx, new FakeEmbeddingProvider());

        var results = await svc.SearchAsync(new SearchQuery());

        Assert.Equal(2, results.Count);
        Assert.Equal("Second", results[0].Title);
    }

    [Fact]
    public async Task SearchAsync_ExcludesPendingAndRejected()
    {
        using var ctx = NewContext();
        SeedApprovedRecap(ctx, "Approved trip", "great");
        var pending = SeedApprovedRecap(ctx, "Pending trip", "meh");
        pending.ModerationStatus = ModerationStatus.Pending;
        var rejected = SeedApprovedRecap(ctx, "Rejected trip", "bad");
        rejected.ModerationStatus = ModerationStatus.Rejected;
        ctx.SaveChanges();
        var svc = new SearchService(ctx, new FakeEmbeddingProvider());

        var results = await svc.SearchAsync(new SearchQuery());

        var titles = results.Select(r => r.Title).ToList();
        Assert.Contains("Approved trip", titles);
        Assert.DoesNotContain("Pending trip", titles);
        Assert.DoesNotContain("Rejected trip", titles);
    }

    [Fact]
    public async Task SearchAsync_FiltersByPlaceTagSeasonBudget()
    {
        using var ctx = NewContext();
        SeedApprovedRecap(ctx, "Kyoto trip", "temples", places: ["Kyoto"], tags: ["temples"], season: "Autumn", budgetBand: "Mid");
        SeedApprovedRecap(ctx, "Paris trip", "museums", places: ["Paris"], tags: ["art"], season: "Spring", budgetBand: "High");
        var svc = new SearchService(ctx, new FakeEmbeddingProvider());

        Assert.Single(await svc.SearchAsync(new SearchQuery(Place: "kyoto")));
        Assert.Single(await svc.SearchAsync(new SearchQuery(Tag: "ART")));
        Assert.Single(await svc.SearchAsync(new SearchQuery(Season: "autumn")));
        Assert.Single(await svc.SearchAsync(new SearchQuery(BudgetBand: "high")));
        Assert.Empty(await svc.SearchAsync(new SearchQuery(Place: "kyoto", Tag: "art")));
    }

    [Fact]
    public async Task SearchAsync_TextQuery_RanksIndexedRecapBySimilarity()
    {
        using var ctx = NewContext();
        var alps = SeedApprovedRecap(ctx, "Swiss Alps hiking", "We hiked snowy mountain trails in the alps.");
        var beach = SeedApprovedRecap(ctx, "Beach resort", "Relaxing on the beach with cocktails and sunshine.");
        var index = new SearchIndexService(ctx, new FakeEmbeddingProvider());
        await index.IndexAsync(alps.Id);
        await index.IndexAsync(beach.Id);
        var svc = new SearchService(ctx, new FakeEmbeddingProvider());

        var results = await svc.SearchAsync(new SearchQuery(Text: "mountain hiking trails snow"));

        Assert.Equal(2, results.Count);
        Assert.Equal("Swiss Alps hiking", results[0].Title);
        Assert.True(results[0].Relevance > results[1].Relevance);
    }

    [Fact]
    public async Task SearchAsync_TextQuery_UnindexedRecap_FallsBackToKeywordMatch()
    {
        using var ctx = NewContext();
        // Not indexed (simulates a recap approved before the indexer ran, or an indexing gap).
        SeedApprovedRecap(ctx, "Unique unindexed title", "mentions zanzibar specifically");
        var svc = new SearchService(ctx, new FakeEmbeddingProvider());

        var results = await svc.SearchAsync(new SearchQuery(Text: "zanzibar"));

        Assert.Single(results);
        Assert.Null(results[0].Relevance);
    }

    [Fact]
    public async Task SearchAsync_TakeIsClampedToRange()
    {
        using var ctx = NewContext();
        for (var i = 0; i < 3; i++)
            SeedApprovedRecap(ctx, $"Trip {i}", "body");
        var svc = new SearchService(ctx, new FakeEmbeddingProvider());

        var results = await svc.SearchAsync(new SearchQuery(Take: 0));
        Assert.Equal(3, results.Count); // clamps to default (20), not zero

        var results2 = await svc.SearchAsync(new SearchQuery(Take: 999));
        Assert.Equal(3, results2.Count); // clamps down, doesn't error
    }
}
