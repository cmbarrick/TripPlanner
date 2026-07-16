using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Wander.Api.Controllers;
using Wander.Api.Data;
using Wander.Api.Models;

namespace Wander.Api.Tests;

/// <summary>
/// Phase 8 (Slice 1): user reports pull a published recap back to Pending immediately, and the
/// (config-admin-gated) review queue can approve/reject it.
/// </summary>
public class ModerationTests
{
    private const string OwnerId = "owner-user";
    private const string ReporterId = "reporter-user";
    private const string AdminId = "admin-user";

    private static WanderDbContext NewContext() =>
        new(new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .EnableSensitiveDataLogging()
            .Options);

    private static PublicRecap SeedPublishedRecap(WanderDbContext ctx)
    {
        var now = DateTimeOffset.UtcNow;
        var trip = new EfCoreTripRepository(ctx).Add(new Trip
        {
            OwnerId = OwnerId,
            Title = "Moderation Trip",
            Destination = "Lisbon, Portugal",
            StartDate = new DateOnly(2026, 1, 1),
            EndDate = new DateOnly(2026, 1, 5),
            Travelers = 1,
            CoverTheme = "lisbon",
            EstimatedCost = 200m,
            Currency = "EUR",
            Days = [new Day { DayNumber = 1, Date = new DateOnly(2026, 1, 1) }],
        });
        var recap = new Recap
        {
            TripId = trip.Id,
            OwnerId = OwnerId,
            Title = "A trip to remember",
            Body = "It was lovely.",
            SourceFingerprint = "fp",
        };
        ctx.Recaps.Add(recap);

        var publicRecap = new PublicRecap
        {
            RecapId = recap.Id,
            TripId = trip.Id,
            OwnerId = OwnerId,
            ModerationStatus = ModerationStatus.Approved,
            PublishedAt = now,
            CreatedAt = now,
        };
        ctx.PublicRecaps.Add(publicRecap);
        ctx.SaveChanges();
        return publicRecap;
    }

    // ---- ModerationQueueService ---------------------------------------------

    [Fact]
    public async Task ReportAsync_PullsApprovedRecapBackToPending()
    {
        using var ctx = NewContext();
        var publicRecap = SeedPublishedRecap(ctx);
        var svc = new ModerationQueueService(ctx, new SearchIndexService(ctx, new FakeEmbeddingProvider()));

        var outcome = await svc.ReportAsync(publicRecap.Id, ReporterId, "This looks fake.");

        Assert.Equal(ReportOutcomeStatus.Reported, outcome.Status);
        var reloaded = await ctx.PublicRecaps.SingleAsync(p => p.Id == publicRecap.Id);
        Assert.Equal(ModerationStatus.Pending, reloaded.ModerationStatus);
        Assert.Single(ctx.PublicRecapReports);
    }

    [Fact]
    public async Task ReportAsync_UnknownRecap_ReturnsNotFound()
    {
        using var ctx = NewContext();
        var svc = new ModerationQueueService(ctx, new SearchIndexService(ctx, new FakeEmbeddingProvider()));

        var outcome = await svc.ReportAsync(Guid.NewGuid(), ReporterId, "reason");

        Assert.Equal(ReportOutcomeStatus.NotFound, outcome.Status);
    }

    [Fact]
    public async Task GetQueueAsync_IncludesPendingAndReported_ExcludesApprovedUnreported()
    {
        using var ctx = NewContext();
        var reported = SeedPublishedRecap(ctx);
        var untouched = SeedPublishedRecap(ctx);
        var svc = new ModerationQueueService(ctx, new SearchIndexService(ctx, new FakeEmbeddingProvider()));
        await svc.ReportAsync(reported.Id, ReporterId, "spam");

        var queue = await svc.GetQueueAsync();

        var item = Assert.Single(queue);
        Assert.Equal(reported.Id, item.PublicRecapId);
        Assert.Equal(1, item.OpenReportCount);
        Assert.DoesNotContain(queue, i => i.PublicRecapId == untouched.Id);
    }

    [Fact]
    public async Task ApproveAsync_ResolvesReportsAndRestoresApproved()
    {
        using var ctx = NewContext();
        var publicRecap = SeedPublishedRecap(ctx);
        var svc = new ModerationQueueService(ctx, new SearchIndexService(ctx, new FakeEmbeddingProvider()));
        await svc.ReportAsync(publicRecap.Id, ReporterId, "spam");

        Assert.True(await svc.ApproveAsync(publicRecap.Id));

        var reloaded = await ctx.PublicRecaps.SingleAsync(p => p.Id == publicRecap.Id);
        Assert.Equal(ModerationStatus.Approved, reloaded.ModerationStatus);
        Assert.All(ctx.PublicRecapReports, r => Assert.Equal(ReportStatus.Reviewed, r.Status));
        Assert.Empty(await svc.GetQueueAsync());
    }

    [Fact]
    public async Task RejectAsync_RecordsReasonAndResolvesReports()
    {
        using var ctx = NewContext();
        var publicRecap = SeedPublishedRecap(ctx);
        var svc = new ModerationQueueService(ctx, new SearchIndexService(ctx, new FakeEmbeddingProvider()));
        await svc.ReportAsync(publicRecap.Id, ReporterId, "spam");

        Assert.True(await svc.RejectAsync(publicRecap.Id, "Confirmed policy violation."));

        var reloaded = await ctx.PublicRecaps.SingleAsync(p => p.Id == publicRecap.Id);
        Assert.Equal(ModerationStatus.Rejected, reloaded.ModerationStatus);
        Assert.Equal("Confirmed policy violation.", reloaded.ModerationReason);
        Assert.Empty(await svc.GetQueueAsync());
    }

    // ---- ModerationController: admin gate ------------------------------------

    [Fact]
    public async Task Controller_Report_AnyAuthenticatedUser_Succeeds()
    {
        var ctx = NewContext();
        var publicRecap = SeedPublishedRecap(ctx);
        var ctrl = BuildController(ctx, ReporterId, admins: []);

        var result = await ctrl.Report(new ReportRequest(publicRecap.Id, "spam"), default);

        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task Controller_Queue_NonAdmin_IsForbidden()
    {
        var ctx = NewContext();
        SeedPublishedRecap(ctx);
        var ctrl = BuildController(ctx, ReporterId, admins: [AdminId]);

        var result = await ctrl.Queue(default);

        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task Controller_Queue_Admin_CanApprove()
    {
        var ctx = NewContext();
        var publicRecap = SeedPublishedRecap(ctx);
        var reporterCtrl = BuildController(ctx, ReporterId, admins: [AdminId]);
        await reporterCtrl.Report(new ReportRequest(publicRecap.Id, "spam"), default);

        var adminCtrl = BuildController(ctx, AdminId, admins: [AdminId]);
        var queue = await adminCtrl.Queue(default);
        Assert.Single(Assert.IsType<OkObjectResult>(queue.Result).Value as IEnumerable<ModerationQueueItem> ?? []);

        var approve = await adminCtrl.Approve(publicRecap.Id, default);
        Assert.IsType<NoContentResult>(approve);
    }

    private static ModerationController BuildController(WanderDbContext ctx, string callerId, string[] admins)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(admins.Select((id, i) => new KeyValuePair<string, string?>($"Moderation:AdminOwnerIds:{i}", id)))
            .Build();
        return new ModerationController(new ModerationQueueService(ctx, new SearchIndexService(ctx, new FakeEmbeddingProvider())), config)
        {
            ControllerContext = FakeAuth.ForUser(callerId),
        };
    }
}
