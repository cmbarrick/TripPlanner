using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wander.Api.Controllers;
using Wander.Api.Data;
using Wander.Api.Models;

namespace Wander.Api.Tests;

/// <summary>
/// Phase 7 (Slice 5): consent is explicit opt-in, and turning sharing off unshares immediately.
/// </summary>
public class ConsentTests
{
    private const string OwnerId = "owner-user";
    private const string OtherUserId = "other-user";

    private static WanderDbContext NewContext() =>
        new(new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .EnableSensitiveDataLogging()
            .Options);

    private static Trip SeedTrip(WanderDbContext ctx, string ownerId = OwnerId)
    {
        var trip = new Trip
        {
            OwnerId = ownerId,
            Title = "Consent Trip",
            Destination = "Rome, Italy",
            StartDate = new DateOnly(2026, 8, 1),
            EndDate = new DateOnly(2026, 8, 3),
            Travelers = 2,
            CoverTheme = "rome",
            EstimatedCost = 500m,
            Currency = "EUR",
            Days = [new Day { DayNumber = 1, Date = new DateOnly(2026, 8, 1) }],
        };
        return new EfCoreTripRepository(ctx).Add(trip);
    }

    // ---- ConsentService -----------------------------------------------------

    [Fact]
    public async Task GetOrCreateAsync_DefaultsAllFlagsToFalse()
    {
        using var ctx = NewContext();
        var setting = await new ConsentService(ctx, new UserService(ctx)).GetOrCreateAsync(OwnerId);

        Assert.False(setting.ShareEnabled);
        Assert.False(setting.PublishEnabled);
        Assert.False(setting.AiUseEnabled);
        Assert.False(setting.AiTrainingEnabled);
        Assert.Single(ctx.ConsentSettings);
    }

    [Fact]
    public async Task UpdateAsync_PartialUpdate_LeavesOtherFlagsUnchanged()
    {
        using var ctx = NewContext();
        var svc = new ConsentService(ctx, new UserService(ctx));
        await svc.UpdateAsync(OwnerId, new ConsentUpdate(ShareEnabled: true, AiUseEnabled: true));

        var setting = await svc.UpdateAsync(OwnerId, new ConsentUpdate(PublishEnabled: true));

        Assert.True(setting.ShareEnabled);
        Assert.True(setting.PublishEnabled);
        Assert.True(setting.AiUseEnabled);
        Assert.False(setting.AiTrainingEnabled);
    }

    [Fact]
    public async Task UpdateAsync_TurningShareOff_RevokesLinksAndMembersImmediately()
    {
        using var ctx = NewContext();
        var trip = SeedTrip(ctx);
        var users = new UserService(ctx);
        var shares = new TripShareService(ctx, new EfCoreTripRepository(ctx), users);
        var consent = new ConsentService(ctx, users);

        await consent.UpdateAsync(OwnerId, new ConsentUpdate(ShareEnabled: true));
        var link = shares.CreateLink(trip.Id, OwnerId, TripMemberRole.Viewer, null);
        shares.Redeem(link.Token, OtherUserId);

        Assert.Single(ctx.TripShares.Where(s => s.OwnerId == OwnerId && s.DeletedAt == null));
        Assert.Single(ctx.TripMembers.Where(m => m.OwnerId == OwnerId && m.DeletedAt == null));

        await consent.UpdateAsync(OwnerId, new ConsentUpdate(ShareEnabled: false));

        Assert.Empty(ctx.TripShares.Where(s => s.OwnerId == OwnerId && s.DeletedAt == null));
        Assert.Empty(ctx.TripMembers.Where(m => m.OwnerId == OwnerId && m.DeletedAt == null));
        // The link itself no longer resolves once revoked.
        Assert.Null(shares.GetSharedTrip(link.Token));
    }

    [Fact]
    public async Task UpdateAsync_TurningShareOffWhileAlreadyOff_IsANoOp()
    {
        using var ctx = NewContext();
        var consent = new ConsentService(ctx, new UserService(ctx));

        var setting = await consent.UpdateAsync(OwnerId, new ConsentUpdate(ShareEnabled: false));

        Assert.False(setting.ShareEnabled);
    }

    // ---- TripSharesController / TripMembersController enforcement -----------

    [Fact]
    public async Task CreateShareLink_WithoutConsent_ReturnsForbidden()
    {
        var (ctx, trip) = SeedForController();
        var ctrl = BuildSharesController(ctx);

        var result = await ctrl.Create(trip.Id, new CreateShareRequest(TripMemberRole.Viewer, null), default);

        var forbidden = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(403, forbidden.StatusCode);
        Assert.Empty(ctx.TripShares);
    }

    [Fact]
    public async Task CreateShareLink_AfterEnablingConsent_Succeeds()
    {
        var (ctx, trip) = SeedForController();
        var users = new UserService(ctx);
        await new ConsentService(ctx, users).UpdateAsync(OwnerId, new ConsentUpdate(ShareEnabled: true));
        var ctrl = BuildSharesController(ctx);

        var result = await ctrl.Create(trip.Id, new CreateShareRequest(TripMemberRole.Viewer, null), default);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.IsType<TripShareView>(ok.Value);
        Assert.Single(ctx.TripShares);
    }

    [Fact]
    public async Task InviteMember_WithoutConsent_ReturnsForbidden()
    {
        var (ctx, trip) = SeedForController();
        new UserService(ctx).GetOrCreate(OtherUserId);
        var ctrl = BuildMembersController(ctx);

        var result = await ctrl.Invite(trip.Id, new InviteMemberRequest($"{OtherUserId}@users.wander", TripMemberRole.Viewer), default);

        var forbidden = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(403, forbidden.StatusCode);
        Assert.Empty(ctx.TripMembers);
    }

    [Fact]
    public async Task InviteMember_AfterEnablingConsent_Succeeds()
    {
        var (ctx, trip) = SeedForController();
        var users = new UserService(ctx);
        var invitee = users.GetOrCreate(OtherUserId);
        await new ConsentService(ctx, users).UpdateAsync(OwnerId, new ConsentUpdate(ShareEnabled: true));
        var ctrl = BuildMembersController(ctx);

        var result = await ctrl.Invite(trip.Id, new InviteMemberRequest(invitee.Email, TripMemberRole.Viewer), default);

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.Single(ctx.TripMembers);
    }

    // ---- Helpers --------------------------------------------------------------

    private static (WanderDbContext ctx, Trip trip) SeedForController()
    {
        var ctx = NewContext();
        var trip = SeedTrip(ctx);
        return (ctx, trip);
    }

    private static TripSharesController BuildSharesController(WanderDbContext ctx)
    {
        var users = new UserService(ctx);
        return new TripSharesController(
            new TripAccessService(ctx, users),
            new TripShareService(ctx, new EfCoreTripRepository(ctx), users),
            new ConsentService(ctx, users))
        {
            ControllerContext = FakeAuth.ForUser(OwnerId),
        };
    }

    private static TripMembersController BuildMembersController(WanderDbContext ctx)
    {
        var users = new UserService(ctx);
        return new TripMembersController(
            new TripAccessService(ctx, users),
            new TripMemberService(ctx),
            new ConsentService(ctx, users))
        {
            ControllerContext = FakeAuth.ForUser(OwnerId),
        };
    }
}
