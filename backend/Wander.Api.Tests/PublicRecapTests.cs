using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wander.Api.Ai;
using Wander.Api.Controllers;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Recaps;

namespace Wander.Api.Tests;

/// <summary>
/// Phase 8 (Slice 0): publishing a recap publicly is gated by two independent checks — the trip
/// must have ended, and the owner must have opted in via <c>ConsentSetting.PublishEnabled</c> —
/// before a (currently fake) content-moderation review runs. Turning publish consent off pulls
/// every public recap immediately, mirroring Phase 7's share-revocation cascade.
/// </summary>
public class PublicRecapTests
{
    private const string OwnerId = "owner-user";

    private static WanderDbContext NewContext() =>
        new(new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .EnableSensitiveDataLogging()
            .Options);

    private static (Trip trip, Recap recap) SeedEndedTripWithRecap(WanderDbContext ctx, string ownerId = OwnerId, bool ended = true) =>
        SeedTripWithRecap(ctx, ownerId, ended);

    private static (Trip trip, Recap recap) SeedTripWithRecap(WanderDbContext ctx, string ownerId, bool ended)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var trip = new EfCoreTripRepository(ctx).Add(new Trip
        {
            OwnerId = ownerId,
            Title = "Published Trip",
            Destination = "Kyoto, Japan",
            StartDate = ended ? today.AddDays(-10) : today.AddDays(5),
            EndDate = ended ? today.AddDays(-3) : today.AddDays(10),
            Travelers = 1,
            CoverTheme = "kyoto",
            EstimatedCost = 500m,
            Currency = "JPY",
            Days = [new Day { DayNumber = 1, Date = ended ? today.AddDays(-10) : today.AddDays(5) }],
        });

        var recap = new Recap
        {
            TripId = trip.Id,
            OwnerId = ownerId,
            Scope = RecapScope.Trip,
            Title = "A wonderful trip",
            Body = "We had a great time.",
            SourceFingerprint = "fp",
        };
        ctx.Recaps.Add(recap);
        ctx.SaveChanges();

        return (trip, recap);
    }

    private static PublicRecapService BuildService(WanderDbContext ctx) =>
        new(ctx, new ConsentService(ctx, new UserService(ctx)), new FakeContentModerationService(),
            new RegexPiiDetectionService(), new SearchIndexService(ctx, new FakeEmbeddingProvider()));

    // ---- PublicRecapService: gates ----------------------------------------

    [Fact]
    public async Task PublishAsync_TripNotEnded_IsBlocked()
    {
        using var ctx = NewContext();
        var (trip, recap) = SeedTripWithRecap(ctx, OwnerId, ended: false);
        var consent = new ConsentService(ctx, new UserService(ctx));
        await consent.UpdateAsync(OwnerId, new ConsentUpdate(PublishEnabled: true));

        var outcome = await BuildService(ctx).PublishAsync(trip.Id, recap.Id, OwnerId, new PublishRequest());

        Assert.Equal(PublishStatus.TripNotEnded, outcome.Status);
        Assert.Empty(ctx.PublicRecaps);
    }

    [Fact]
    public async Task PublishAsync_WithoutConsent_IsBlocked()
    {
        using var ctx = NewContext();
        var (trip, recap) = SeedEndedTripWithRecap(ctx);

        var outcome = await BuildService(ctx).PublishAsync(trip.Id, recap.Id, OwnerId, new PublishRequest());

        Assert.Equal(PublishStatus.PublishNotConsented, outcome.Status);
        Assert.Empty(ctx.PublicRecaps);
    }

    [Fact]
    public async Task PublishAsync_TripEndedAndConsented_Publishes()
    {
        using var ctx = NewContext();
        var (trip, recap) = SeedEndedTripWithRecap(ctx);
        await new ConsentService(ctx, new UserService(ctx)).UpdateAsync(OwnerId, new ConsentUpdate(PublishEnabled: true));

        var outcome = await BuildService(ctx).PublishAsync(
            trip.Id, recap.Id, OwnerId, new PublishRequest(Places: ["Kyoto"], Tags: ["temples"], Season: "Spring"));

        Assert.Equal(PublishStatus.Published, outcome.Status);
        Assert.Equal(ModerationStatus.Approved, outcome.View!.ModerationStatus);
        Assert.Equal("Kyoto", outcome.View.Places.Single());
        Assert.Single(ctx.PublicRecaps.Where(p => p.DeletedAt == null));
    }

    [Fact]
    public async Task PublishAsync_FlaggedContent_IsRejectedButRecorded()
    {
        using var ctx = NewContext();
        var (trip, recap) = SeedEndedTripWithRecap(ctx);
        recap.Body = $"Great trip. {FakeContentModerationService.UnsafeMarker}";
        ctx.SaveChanges();
        await new ConsentService(ctx, new UserService(ctx)).UpdateAsync(OwnerId, new ConsentUpdate(PublishEnabled: true));

        var outcome = await BuildService(ctx).PublishAsync(trip.Id, recap.Id, OwnerId, new PublishRequest());

        Assert.Equal(PublishStatus.Rejected, outcome.Status);
        Assert.Equal(ModerationStatus.Rejected, outcome.View!.ModerationStatus);
        Assert.NotNull(outcome.View.ModerationReason);
    }

    [Fact]
    public async Task PublishAsync_PiiDetected_BlocksPublishAndReturnsFindings()
    {
        using var ctx = NewContext();
        var (trip, recap) = SeedEndedTripWithRecap(ctx);
        recap.Body = "Contact me at traveler@example.com for details.";
        ctx.SaveChanges();
        await new ConsentService(ctx, new UserService(ctx)).UpdateAsync(OwnerId, new ConsentUpdate(PublishEnabled: true));

        var outcome = await BuildService(ctx).PublishAsync(trip.Id, recap.Id, OwnerId, new PublishRequest());

        Assert.Equal(PublishStatus.PiiReviewRequired, outcome.Status);
        Assert.Null(outcome.View);
        Assert.Single(outcome.PiiFindings!);
        Assert.Equal(PiiType.Email, outcome.PiiFindings!.Single().Type);
        Assert.Empty(ctx.PublicRecaps);
    }

    [Fact]
    public async Task PublishAsync_PiiDetected_AcknowledgePii_Publishes()
    {
        using var ctx = NewContext();
        var (trip, recap) = SeedEndedTripWithRecap(ctx);
        recap.Body = "Contact me at traveler@example.com for details.";
        ctx.SaveChanges();
        await new ConsentService(ctx, new UserService(ctx)).UpdateAsync(OwnerId, new ConsentUpdate(PublishEnabled: true));

        var outcome = await BuildService(ctx).PublishAsync(
            trip.Id, recap.Id, OwnerId, new PublishRequest(AcknowledgePii: true));

        Assert.Equal(PublishStatus.Published, outcome.Status);
        Assert.Single(ctx.PublicRecaps.Where(p => p.DeletedAt == null));
    }

    [Fact]
    public async Task PublishAsync_Republish_RevivesRatherThanDuplicates()
    {
        using var ctx = NewContext();
        var (trip, recap) = SeedEndedTripWithRecap(ctx);
        var users = new UserService(ctx);
        await new ConsentService(ctx, users).UpdateAsync(OwnerId, new ConsentUpdate(PublishEnabled: true));
        var service = BuildService(ctx);

        var first = await service.PublishAsync(trip.Id, recap.Id, OwnerId, new PublishRequest());
        Assert.True(await service.UnpublishAsync(trip.Id, recap.Id, OwnerId));
        var second = await service.PublishAsync(trip.Id, recap.Id, OwnerId, new PublishRequest());

        Assert.Equal(PublishStatus.Published, second.Status);
        Assert.Equal(first.View!.Id, second.View!.Id);
        Assert.Single(ctx.PublicRecaps);
        Assert.Single(ctx.PublicRecaps.Where(p => p.DeletedAt == null));
    }

    [Fact]
    public async Task Unpublish_RemovesFromDiscovery_AndStatusReflectsIt()
    {
        using var ctx = NewContext();
        var (trip, recap) = SeedEndedTripWithRecap(ctx);
        await new ConsentService(ctx, new UserService(ctx)).UpdateAsync(OwnerId, new ConsentUpdate(PublishEnabled: true));
        var service = BuildService(ctx);
        await service.PublishAsync(trip.Id, recap.Id, OwnerId, new PublishRequest());

        Assert.NotNull(service.GetStatus(recap.Id, OwnerId));
        Assert.True(await service.UnpublishAsync(trip.Id, recap.Id, OwnerId));
        Assert.Null(service.GetStatus(recap.Id, OwnerId));
        Assert.False(await service.UnpublishAsync(trip.Id, recap.Id, OwnerId));
    }

    // ---- Consent lifecycle: PublishEnabled off unpublishes immediately ----

    [Fact]
    public async Task DisablingPublishConsent_UnpublishesEverythingImmediately()
    {
        using var ctx = NewContext();
        var (trip, recap) = SeedEndedTripWithRecap(ctx);
        var consent = new ConsentService(ctx, new UserService(ctx));
        await consent.UpdateAsync(OwnerId, new ConsentUpdate(PublishEnabled: true));
        await BuildService(ctx).PublishAsync(trip.Id, recap.Id, OwnerId, new PublishRequest());

        Assert.Single(ctx.PublicRecaps.Where(p => p.DeletedAt == null));

        await consent.UpdateAsync(OwnerId, new ConsentUpdate(PublishEnabled: false));

        Assert.Empty(ctx.PublicRecaps.Where(p => p.DeletedAt == null));
    }

    // ---- RecapsController enforcement --------------------------------------

    [Fact]
    public async Task Controller_Publish_TripNotEnded_ReturnsBadRequest()
    {
        var ctx = NewContext();
        var (trip, recap) = SeedTripWithRecap(ctx, OwnerId, ended: false);
        var ctrl = BuildController(ctx);

        var result = await ctrl.Publish(trip.Id, recap.Id, new PublishRecapRequest(), default);

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task Controller_Publish_WithoutConsent_ReturnsForbidden()
    {
        var ctx = NewContext();
        var (trip, recap) = SeedEndedTripWithRecap(ctx);
        var ctrl = BuildController(ctx);

        var result = await ctrl.Publish(trip.Id, recap.Id, new PublishRecapRequest(), default);

        var forbidden = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(403, forbidden.StatusCode);
    }

    [Fact]
    public async Task Controller_Publish_PiiDetected_Returns422WithFindings()
    {
        var ctx = NewContext();
        var (trip, recap) = SeedEndedTripWithRecap(ctx);
        recap.Body = "Reach me at traveler@example.com.";
        ctx.SaveChanges();
        await new ConsentService(ctx, new UserService(ctx)).UpdateAsync(OwnerId, new ConsentUpdate(PublishEnabled: true));
        var ctrl = BuildController(ctx);

        var result = await ctrl.Publish(trip.Id, recap.Id, new PublishRecapRequest(), default);

        var unprocessable = Assert.IsType<UnprocessableEntityObjectResult>(result.Result);
        var body = Assert.IsType<PiiReviewRequiredDto>(unprocessable.Value);
        Assert.Single(body.Findings);
        Assert.Empty(ctx.PublicRecaps);
    }

    [Fact]
    public async Task Controller_PublishThenUnpublish_RoundTrips()
    {
        var ctx = NewContext();
        var (trip, recap) = SeedEndedTripWithRecap(ctx);
        await new ConsentService(ctx, new UserService(ctx)).UpdateAsync(OwnerId, new ConsentUpdate(PublishEnabled: true));
        var ctrl = BuildController(ctx);

        var published = await ctrl.Publish(trip.Id, recap.Id, new PublishRecapRequest(), default);
        Assert.IsType<OkObjectResult>(published.Result);

        var status = ctrl.GetPublishStatus(trip.Id, recap.Id);
        Assert.IsType<OkObjectResult>(status.Result);

        var unpublished = await ctrl.Unpublish(trip.Id, recap.Id, default);
        Assert.IsType<NoContentResult>(unpublished);

        var statusAfter = ctrl.GetPublishStatus(trip.Id, recap.Id);
        Assert.IsType<NotFoundResult>(statusAfter.Result);
    }

    private static RecapsController BuildController(WanderDbContext ctx)
    {
        var users = new UserService(ctx);
        var consent = new ConsentService(ctx, users);
        var ai = new DisabledAiProvider();
        var quota = new AiTokenQuotaService(
            ctx, Microsoft.Extensions.Options.Options.Create(new AiOptions { DailyTokenLimit = 50_000 }));

        // Publish/Unpublish/GetPublishStatus (the only endpoints these tests exercise) don't use
        // generation/export/trips at all — real fakes just satisfy the constructor.
        return new RecapsController(
            ai,
            new RecapGenerationService(
                ai, new EfCoreTripRepository(ctx), new EfCoreNoteRepository(ctx), new EfCoreRecapRepository(ctx),
                new Wander.Api.Weather.FakeHistoricalWeatherProvider(), quota),
            new EfCoreRecapRepository(ctx),
            null!,
            new EfCoreTripRepository(ctx),
            new PublicRecapService(ctx, consent, new FakeContentModerationService(),
                new RegexPiiDetectionService(), new SearchIndexService(ctx, new FakeEmbeddingProvider())))
        {
            ControllerContext = FakeAuth.ForUser(OwnerId),
        };
    }
}
