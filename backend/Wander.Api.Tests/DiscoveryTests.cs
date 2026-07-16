using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wander.Api.Ai;
using Wander.Api.Controllers;
using Wander.Api.Data;
using Wander.Api.Discovery;
using Wander.Api.Models;

namespace Wander.Api.Tests;

/// <summary>
/// Phase 8 (Slice 3): the RAG discovery assistant retrieves via <see cref="ISearchService"/>, then
/// asks the model for a grounded answer citing only recaps it was actually shown.
/// </summary>
public class DiscoveryTests
{
    private const string OwnerId = "asker-user";
    private const string RecapOwnerId = "recap-owner";

    private static WanderDbContext NewContext() =>
        new(new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .EnableSensitiveDataLogging()
            .Options);

    private static void SeedApprovedRecap(WanderDbContext ctx, string title, string body)
    {
        var now = DateTimeOffset.UtcNow;
        var trip = new EfCoreTripRepository(ctx).Add(new Trip
        {
            OwnerId = RecapOwnerId,
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
        var recap = new Recap { TripId = trip.Id, OwnerId = RecapOwnerId, Title = title, Body = body, SourceFingerprint = "fp" };
        ctx.Recaps.Add(recap);
        ctx.PublicRecaps.Add(new PublicRecap
        {
            RecapId = recap.Id,
            TripId = trip.Id,
            OwnerId = RecapOwnerId,
            ModerationStatus = ModerationStatus.Approved,
            PublishedAt = now,
            CreatedAt = now,
        });
        ctx.SaveChanges();
    }

    private static AiTokenQuotaService BuildQuota(WanderDbContext ctx, int dailyLimit = 50_000) =>
        new(ctx, Microsoft.Extensions.Options.Options.Create(new AiOptions { DailyTokenLimit = dailyLimit }));

    // ---- DiscoveryPromptBuilder / DiscoveryValidator (pure logic) -------------

    [Fact]
    public void FormatContext_IncludesQuestionAndLabeledSources()
    {
        var sources = new List<DiscoveryPromptBuilder.LabeledSource>
        {
            new("r1", Guid.NewGuid(), "Kyoto in autumn", "Beautiful temples."),
        };

        var context = DiscoveryPromptBuilder.FormatContext("What's Kyoto like?", sources);

        Assert.Contains("What's Kyoto like?", context);
        Assert.Contains("[r1]", context);
        Assert.Contains("Kyoto in autumn", context);
    }

    [Fact]
    public void ParseAndValidate_HasAnswerFalse_ReturnsNoSource()
    {
        var result = DiscoveryValidator.ParseAndValidate(
            """{"hasAnswer":false,"answer":"","sourceLabels":[]}""",
            new Dictionary<string, DiscoveryCitation>(), 10);

        Assert.Equal(DiscoveryAnswerStatus.NoSource, result.Status);
        Assert.Null(result.Answer);
        Assert.Empty(result.Citations);
    }

    [Fact]
    public void ParseAndValidate_DropsInventedLabels()
    {
        var real = new DiscoveryCitation(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "Real recap", []);
        var byLabel = new Dictionary<string, DiscoveryCitation> { ["r1"] = real };

        var result = DiscoveryValidator.ParseAndValidate(
            """{"hasAnswer":true,"answer":"Here is the answer.","sourceLabels":["r1","r99"]}""",
            byLabel, 42);

        Assert.Equal(DiscoveryAnswerStatus.Answered, result.Status);
        Assert.Equal("Here is the answer.", result.Answer);
        var citation = Assert.Single(result.Citations);
        Assert.Equal(real.PublicRecapId, citation.PublicRecapId);
        Assert.Equal(42, result.TokensUsed);
    }

    [Fact]
    public void ParseAndValidate_MalformedJson_Throws()
    {
        Assert.Throws<DiscoveryParseException>(() =>
            DiscoveryValidator.ParseAndValidate("not json", new Dictionary<string, DiscoveryCitation>(), 0));
    }

    // ---- DiscoveryAssistantService ---------------------------------------------

    [Fact]
    public async Task AskAsync_NoMatchingRecaps_ReturnsNoSourceWithoutCallingAi()
    {
        using var ctx = NewContext();
        var search = new SearchService(ctx, new FakeEmbeddingProvider());
        var svc = new DiscoveryAssistantService(new FakeAiProvider(), search, ctx, BuildQuota(ctx));

        var answer = await svc.AskAsync(OwnerId, "What's the best hiking in Peru?");

        Assert.Equal(DiscoveryAnswerStatus.NoSource, answer.Status);
        Assert.Equal(0, answer.TokensUsed);
    }

    /// <summary>A search stub that hands back one caller-controlled result, so the relevance floor
    /// can be tested deterministically without depending on the fake embedding's actual hash output.</summary>
    private sealed class StubSearchService(SearchResultDto result) : ISearchService
    {
        public Task<IReadOnlyList<SearchResultDto>> SearchAsync(SearchQuery query, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<SearchResultDto>>([result]);
    }

    [Fact]
    public async Task AskAsync_BelowRelevanceFloor_IsTreatedAsNotFound()
    {
        using var ctx = NewContext();
        SeedApprovedRecap(ctx, "Some trip", "Some body.");
        var publicRecap = await ctx.PublicRecaps.SingleAsync();
        var weakMatch = new SearchResultDto(
            publicRecap.Id, publicRecap.RecapId, publicRecap.TripId, "Some trip", "Some body.",
            [], [], null, null, DateTimeOffset.UtcNow, Relevance: DiscoveryAssistantService.MinRelevance - 0.01);

        var svc = new DiscoveryAssistantService(new FakeAiProvider(), new StubSearchService(weakMatch), ctx, BuildQuota(ctx));

        var answer = await svc.AskAsync(OwnerId, "irrelevant question");

        Assert.Equal(DiscoveryAnswerStatus.NoSource, answer.Status);
    }

    [Fact]
    public async Task AskAsync_AtOrAboveRelevanceFloor_IsUsed()
    {
        using var ctx = NewContext();
        SeedApprovedRecap(ctx, "Some trip", "Some body.");
        var publicRecap = await ctx.PublicRecaps.SingleAsync();
        var match = new SearchResultDto(
            publicRecap.Id, publicRecap.RecapId, publicRecap.TripId, "Some trip", "Some body.",
            [], [], null, null, DateTimeOffset.UtcNow, Relevance: DiscoveryAssistantService.MinRelevance);

        var svc = new DiscoveryAssistantService(new FakeAiProvider(), new StubSearchService(match), ctx, BuildQuota(ctx));

        var answer = await svc.AskAsync(OwnerId, "a question");

        Assert.Equal(DiscoveryAnswerStatus.Answered, answer.Status);
    }

    [Fact]
    public async Task AskAsync_WithMatchingRecap_ReturnsGroundedAnswerWithCitation()
    {
        using var ctx = NewContext();
        SeedApprovedRecap(ctx, "Swiss Alps hiking", "We hiked snowy mountain trails in the alps.");
        var index = new SearchIndexService(ctx, new FakeEmbeddingProvider());
        var publicRecap = await ctx.PublicRecaps.SingleAsync();
        await index.IndexAsync(publicRecap.Id);

        var search = new SearchService(ctx, new FakeEmbeddingProvider());
        var svc = new DiscoveryAssistantService(new FakeAiProvider(), search, ctx, BuildQuota(ctx));

        var answer = await svc.AskAsync(OwnerId, "mountain hiking trails");

        Assert.Equal(DiscoveryAnswerStatus.Answered, answer.Status);
        Assert.False(string.IsNullOrWhiteSpace(answer.Answer));
        var citation = Assert.Single(answer.Citations);
        Assert.Equal(publicRecap.RecapId, citation.RecapId);
        Assert.True(answer.TokensUsed > 0);
    }

    [Fact]
    public async Task AskAsync_EmptyQuestion_Throws()
    {
        using var ctx = NewContext();
        var search = new SearchService(ctx, new FakeEmbeddingProvider());
        var svc = new DiscoveryAssistantService(new FakeAiProvider(), search, ctx, BuildQuota(ctx));

        await Assert.ThrowsAsync<ArgumentException>(() => svc.AskAsync(OwnerId, "   "));
    }

    [Fact]
    public async Task AskAsync_AiDisabled_Throws()
    {
        using var ctx = NewContext();
        SeedApprovedRecap(ctx, "Some trip", "Some body.");
        var index = new SearchIndexService(ctx, new FakeEmbeddingProvider());
        await index.IndexAsync((await ctx.PublicRecaps.SingleAsync()).Id);

        var search = new SearchService(ctx, new FakeEmbeddingProvider());
        var svc = new DiscoveryAssistantService(new DisabledAiProvider(), search, ctx, BuildQuota(ctx));

        await Assert.ThrowsAsync<InvalidOperationException>(() => svc.AskAsync(OwnerId, "a question"));
    }

    [Fact]
    public async Task AskAsync_QuotaExhausted_Throws()
    {
        using var ctx = NewContext();
        SeedApprovedRecap(ctx, "Swiss Alps hiking", "We hiked snowy mountain trails in the alps.");
        var index = new SearchIndexService(ctx, new FakeEmbeddingProvider());
        await index.IndexAsync((await ctx.PublicRecaps.SingleAsync()).Id);

        var search = new SearchService(ctx, new FakeEmbeddingProvider());
        var svc = new DiscoveryAssistantService(new FakeAiProvider(), search, ctx, BuildQuota(ctx, dailyLimit: 0));

        // Must actually clear the relevance floor to reach the quota check.
        await Assert.ThrowsAsync<AiQuotaExceededException>(() => svc.AskAsync(OwnerId, "mountain hiking trails"));
    }

    // ---- DiscoveryController ----------------------------------------------------

    [Fact]
    public async Task Controller_Ask_NoSource_ReturnsHasAnswerFalse()
    {
        using var ctx = NewContext();
        var search = new SearchService(ctx, new FakeEmbeddingProvider());
        var assistant = new DiscoveryAssistantService(new FakeAiProvider(), search, ctx, BuildQuota(ctx));
        var ctrl = new DiscoveryController(search, assistant) { ControllerContext = FakeAuth.ForUser(OwnerId) };

        var result = await ctrl.Ask(new AskDiscoveryRequest("anything at all"), default);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<AskDiscoveryResponse>(ok.Value);
        Assert.False(response.HasAnswer);
    }

    [Fact]
    public async Task Controller_Ask_WithMatch_ReturnsAnswerAndCitation()
    {
        using var ctx = NewContext();
        SeedApprovedRecap(ctx, "Swiss Alps hiking", "We hiked snowy mountain trails in the alps.");
        var index = new SearchIndexService(ctx, new FakeEmbeddingProvider());
        await index.IndexAsync((await ctx.PublicRecaps.SingleAsync()).Id);

        var search = new SearchService(ctx, new FakeEmbeddingProvider());
        var assistant = new DiscoveryAssistantService(new FakeAiProvider(), search, ctx, BuildQuota(ctx));
        var ctrl = new DiscoveryController(search, assistant) { ControllerContext = FakeAuth.ForUser(OwnerId) };

        var result = await ctrl.Ask(new AskDiscoveryRequest("mountain hiking trails"), default);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<AskDiscoveryResponse>(ok.Value);
        Assert.True(response.HasAnswer);
        Assert.Single(response.Citations);
    }

    [Fact]
    public async Task Controller_Ask_AiDisabled_Returns503()
    {
        using var ctx = NewContext();
        SeedApprovedRecap(ctx, "Some trip", "Some body.");
        var index = new SearchIndexService(ctx, new FakeEmbeddingProvider());
        await index.IndexAsync((await ctx.PublicRecaps.SingleAsync()).Id);

        var search = new SearchService(ctx, new FakeEmbeddingProvider());
        var assistant = new DiscoveryAssistantService(new DisabledAiProvider(), search, ctx, BuildQuota(ctx));
        var ctrl = new DiscoveryController(search, assistant) { ControllerContext = FakeAuth.ForUser(OwnerId) };

        var result = await ctrl.Ask(new AskDiscoveryRequest("a question"), default);

        var objResult = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(503, objResult.StatusCode);
    }
}
