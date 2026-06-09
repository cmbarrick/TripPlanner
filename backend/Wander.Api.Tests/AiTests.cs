using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wander.Api.Ai;
using Wander.Api.Controllers;
using Wander.Api.Data;

namespace Wander.Api.Tests;

public class AiPromptBuilderTests
{
    [Fact]
    public void BuildSystemMessage_WithoutExtra_ReturnsStablePrefix()
    {
        var msg = AiPromptBuilder.BuildSystemMessage();
        Assert.Equal(AiRole.System, msg.Role);
        Assert.Equal(AiPromptBuilder.SystemPrefix, msg.Content);
    }

    [Fact]
    public void BuildSystemMessage_WithExtra_AppendsContextAfterPrefix()
    {
        var msg = AiPromptBuilder.BuildSystemMessage("Trip: Lisbon");
        Assert.StartsWith(AiPromptBuilder.SystemPrefix, msg.Content);
        Assert.Contains("Trip: Lisbon", msg.Content);
    }

    [Fact]
    public void FormatDaySummary_EmptyItems_ShowsEmpty()
    {
        var line = AiPromptBuilder.FormatDaySummary(1, new DateOnly(2026, 6, 10), []);
        Assert.Equal("Day 1 (2026-06-10): empty", line);
    }

    [Fact]
    public void FormatDaySummary_WithItems_JoinsTitles()
    {
        var line = AiPromptBuilder.FormatDaySummary(2, new DateOnly(2026, 6, 11), ["Belém", "Dinner"]);
        Assert.Contains("Belém; Dinner", line);
    }

    [Fact]
    public void FormatUserPreferences_WithValues_JoinsParts()
    {
        var line = AiPromptBuilder.FormatUserPreferences("foodie", "relaxed", "vegetarian", "mid");
        Assert.Equal("User preferences: travel style: foodie; pace: relaxed; diet: vegetarian; budget: mid", line);
    }

    [Fact]
    public void FormatUserPreferences_NoneDiet_OmitsDiet()
    {
        var line = AiPromptBuilder.FormatUserPreferences(null, "moderate", "none", "budget");
        Assert.Equal("User preferences: pace: moderate; budget: budget", line);
    }

    [Fact]
    public void FormatUserPreferences_AllEmpty_ReturnsNull()
    {
        Assert.Null(AiPromptBuilder.FormatUserPreferences(null, null, null, null));
    }
}

public class DisabledAiProviderTests
{
    [Fact]
    public void IsEnabled_IsFalse()
    {
        Assert.False(new DisabledAiProvider().IsEnabled);
    }

    [Fact]
    public async Task CompleteAsync_YieldsDisabledDoneWithZeroUsage()
    {
        var provider = new DisabledAiProvider();
        var deltas = new List<AiCompletionDelta>();
        await foreach (var d in provider.CompleteAsync(
            new AiCompletionRequest([], []),
            CancellationToken.None))
        {
            deltas.Add(d);
        }

        Assert.Contains(deltas, d => d is TextDelta);
        var done = Assert.IsType<CompletionDone>(deltas.Last());
        Assert.Equal(AiFinishReason.Disabled, done.Reason);
        Assert.Equal(0, done.Usage.TotalTokens);
    }
}

public class FakeAiProviderTests
{
    [Fact]
    public async Task CompleteAsync_EchoesUserMessage()
    {
        var provider = new FakeAiProvider();
        var request = new AiCompletionRequest(
            [new AiMessage(AiRole.User, "Plan Lisbon")],
            []);

        var text = new List<string>();
        AiUsage? usage = null;
        await foreach (var d in provider.CompleteAsync(request, CancellationToken.None))
        {
            if (d is TextDelta t) text.Add(t.Text);
            if (d is CompletionDone done) usage = done.Usage;
        }

        Assert.Contains(text, t => t.Contains("Plan Lisbon"));
        Assert.NotNull(usage);
        Assert.True(usage!.TotalTokens > 0);
    }
}

public class AiTokenQuotaServiceTests
{
    private static AiTokenQuotaService NewService(WanderDbContext db, int dailyLimit = 100) =>
        new(db, Options.Create(new AiOptions { DailyTokenLimit = dailyLimit }));

    [Fact]
    public async Task GetSnapshot_NoUsage_ReturnsFullHeadroom()
    {
        await using var db = NewDb();
        var svc = NewService(db, dailyLimit: 1000);
        var snap = await svc.GetSnapshotAsync("user-a", CancellationToken.None);
        Assert.Equal(1000, snap.DailyLimit);
        Assert.Equal(0, snap.UsedToday);
        Assert.Equal(1000, snap.RemainingToday);
    }

    [Fact]
    public async Task TryRecordUsage_WithinLimit_SucceedsAndIncrements()
    {
        await using var db = NewDb();
        var svc = NewService(db, dailyLimit: 100);
        Assert.True(await svc.TryRecordUsageAsync("user-a", new AiUsage(30, 20), CancellationToken.None));
        var snap = await svc.GetSnapshotAsync("user-a", CancellationToken.None);
        Assert.Equal(50, snap.UsedToday);
        Assert.Equal(50, snap.RemainingToday);
    }

    [Fact]
    public async Task TryRecordUsage_ExceedsLimit_ReturnsFalse()
    {
        await using var db = NewDb();
        var svc = NewService(db, dailyLimit: 100);
        Assert.True(await svc.TryRecordUsageAsync("user-a", new AiUsage(60, 0), CancellationToken.None));
        Assert.False(await svc.TryRecordUsageAsync("user-a", new AiUsage(50, 0), CancellationToken.None));
        var snap = await svc.GetSnapshotAsync("user-a", CancellationToken.None);
        Assert.Equal(60, snap.UsedToday);
    }

    [Fact]
    public async Task TryRecordUsage_ZeroTokens_AlwaysSucceeds()
    {
        await using var db = NewDb();
        var svc = NewService(db, dailyLimit: 0);
        Assert.True(await svc.TryRecordUsageAsync("user-a", new AiUsage(0, 0), CancellationToken.None));
    }

    private static WanderDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new WanderDbContext(options);
    }
}

public class AiControllerTests
{
    [Fact]
    public async Task GetStatus_WhenDisabled_ReturnsEnabledFalse()
    {
        var ctrl = new AiController(new DisabledAiProvider(), NewQuotaService());
        ctrl.ControllerContext = FakeAuth.ForUser("user-1");

        var result = await ctrl.GetStatus(CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var body = Assert.IsType<AiStatusResponse>(ok.Value);
        Assert.False(body.Enabled);
        Assert.True(body.TokensRemainingToday >= 0);
    }

    [Fact]
    public async Task GetStatus_WhenFakeEnabled_ReturnsEnabledTrue()
    {
        var ctrl = new AiController(new FakeAiProvider(), NewQuotaService());
        ctrl.ControllerContext = FakeAuth.ForUser("user-1");

        var result = await ctrl.GetStatus(CancellationToken.None);
        var body = Assert.IsType<AiStatusResponse>(((OkObjectResult)result.Result!).Value);
        Assert.True(body.Enabled);
    }

    private static IAiTokenQuotaService NewQuotaService()
    {
        var db = new WanderDbContext(new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        return new AiTokenQuotaService(db, Options.Create(new AiOptions { DailyTokenLimit = 50_000 }));
    }
}
