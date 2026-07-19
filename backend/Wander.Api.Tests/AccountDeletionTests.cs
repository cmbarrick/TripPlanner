using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wander.Api.Controllers;
using Wander.Api.Data;
using Wander.Api.Models;

namespace Wander.Api.Tests;

/// <summary>
/// Phase 9: in-app account deletion (Apple Guideline 5.1.1(v) / Google Play equivalent).
/// </summary>
public class AccountDeletionTests
{
    private const string OwnerId = "owner-user";
    private const string OtherUserId = "other-user";

    private static WanderDbContext NewContext() =>
        new(new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .EnableSensitiveDataLogging()
            .Options);

    [Fact]
    public async Task DeleteAccountAsync_UnknownOwner_ReturnsFalse()
    {
        using var ctx = NewContext();
        var deleted = await new AccountDeletionService(ctx).DeleteAccountAsync("nobody");

        Assert.False(deleted);
    }

    // Regression: the Users row is created lazily (first touch of preferences/consent/sharing), so
    // an owner who has only ever created a trip may have real, owned data but no Users row at all.
    // Deletion must not silently no-op (return false) in that case — found live, not in a unit test,
    // by creating a trip via curl with a fresh X-Dev-User-Id and then deleting: the first version of
    // this service required a Users row to exist and reported 404 despite a live trip still sitting
    // undeleted underneath it.
    [Fact]
    public async Task DeleteAccountAsync_OwnerWithNoUsersRow_StillDeletesOwnedData()
    {
        using var ctx = NewContext();
        // Deliberately skip UserService.GetOrCreate — this owner has never touched preferences/consent.
        var trip = new EfCoreTripRepository(ctx).Add(new Trip
        {
            OwnerId = OwnerId,
            Title = "No Users Row Yet",
            Destination = "Nowhere",
            StartDate = new DateOnly(2026, 8, 1),
            EndDate = new DateOnly(2026, 8, 3),
            Currency = "EUR",
        });
        Assert.Empty(ctx.Users.Where(u => u.OwnerId == OwnerId));

        var deleted = await new AccountDeletionService(ctx).DeleteAccountAsync(OwnerId);

        Assert.True(deleted);
        Assert.NotNull(ctx.Trips.Single(t => t.Id == trip.Id).DeletedAt);
    }

    [Fact]
    public async Task DeleteAccountAsync_SoftDeletesTripAndDescendants()
    {
        using var ctx = NewContext();
        var users = new UserService(ctx);
        users.GetOrCreate(OwnerId);

        var trip = new EfCoreTripRepository(ctx).Add(new Trip
        {
            OwnerId = OwnerId,
            Title = "Rome",
            Destination = "Rome, Italy",
            StartDate = new DateOnly(2026, 8, 1),
            EndDate = new DateOnly(2026, 8, 3),
            Currency = "EUR",
            Days = [new Day { OwnerId = OwnerId, DayNumber = 1, Date = new DateOnly(2026, 8, 1) }],
        });
        ctx.ItineraryItems.Add(new ItineraryItem
        {
            TripId = trip.Id,
            DayId = trip.Days[0].Id,
            OwnerId = OwnerId,
            Title = "Colosseum",
        });
        ctx.PackingItems.Add(new PackingItem { OwnerId = OwnerId, DayId = trip.Days[0].Id, Name = "Passport" });
        ctx.SaveChanges();

        var deleted = await new AccountDeletionService(ctx).DeleteAccountAsync(OwnerId);

        Assert.True(deleted);
        Assert.All(ctx.Trips.Where(t => t.OwnerId == OwnerId), t => Assert.NotNull(t.DeletedAt));
        Assert.All(ctx.Days.Where(d => d.OwnerId == OwnerId), d => Assert.NotNull(d.DeletedAt));
        Assert.All(ctx.ItineraryItems.Where(i => i.OwnerId == OwnerId), i => Assert.NotNull(i.DeletedAt));
        Assert.All(ctx.PackingItems.Where(p => p.OwnerId == OwnerId), p => Assert.NotNull(p.DeletedAt));
    }

    [Fact]
    public async Task DeleteAccountAsync_SoftDeletesNotesMediaRecapsReactionsShares()
    {
        using var ctx = NewContext();
        var users = new UserService(ctx);
        users.GetOrCreate(OwnerId);

        var trip = new EfCoreTripRepository(ctx).Add(new Trip
        {
            OwnerId = OwnerId,
            Title = "Kyoto",
            Destination = "Kyoto, Japan",
            StartDate = new DateOnly(2026, 9, 1),
            EndDate = new DateOnly(2026, 9, 3),
            Currency = "JPY",
        });

        var note = new Note { TripId = trip.Id, OwnerId = OwnerId, BodyText = "Great day" };
        ctx.Notes.Add(note);
        ctx.SaveChanges();
        ctx.MediaAssets.Add(new MediaAsset { NoteId = note.Id, OwnerId = OwnerId, BlobName = "b1" });
        ctx.Recaps.Add(new Recap { TripId = trip.Id, OwnerId = OwnerId, Title = "Recap", Body = "Body" });
        ctx.Reactions.Add(new Reaction { TripId = trip.Id, OwnerId = OwnerId, TargetType = ReactionTargetType.Trip, TargetId = trip.Id, Emoji = "🎉" });
        ctx.TripShares.Add(new TripShare { TripId = trip.Id, OwnerId = OwnerId, Token = "tok1" });
        ctx.SaveChanges();

        var deleted = await new AccountDeletionService(ctx).DeleteAccountAsync(OwnerId);

        Assert.True(deleted);
        Assert.All(ctx.Notes.Where(n => n.OwnerId == OwnerId), n => Assert.NotNull(n.DeletedAt));
        Assert.All(ctx.MediaAssets.Where(m => m.OwnerId == OwnerId), m => Assert.NotNull(m.DeletedAt));
        Assert.All(ctx.Recaps.Where(r => r.OwnerId == OwnerId), r => Assert.NotNull(r.DeletedAt));
        Assert.All(ctx.Reactions.Where(r => r.OwnerId == OwnerId), r => Assert.NotNull(r.DeletedAt));
        Assert.All(ctx.TripShares.Where(s => s.OwnerId == OwnerId), s => Assert.NotNull(s.DeletedAt));
    }

    [Fact]
    public async Task DeleteAccountAsync_ClearsMembershipOnOthersTripsAndOwnPreferencesConsent()
    {
        using var ctx = NewContext();
        var users = new UserService(ctx);
        var me = users.GetOrCreate(OwnerId);
        users.GetOrCreate(OtherUserId);

        var othersTrip = new EfCoreTripRepository(ctx).Add(new Trip
        {
            OwnerId = OtherUserId,
            Title = "Shared trip",
            Destination = "Lisbon, Portugal",
            StartDate = new DateOnly(2026, 10, 1),
            EndDate = new DateOnly(2026, 10, 3),
            Currency = "EUR",
        });
        // I'm a member of someone else's trip (membership row is owned by the trip owner, references my UserId).
        ctx.TripMembers.Add(new TripMember { OwnerId = OtherUserId, TripId = othersTrip.Id, UserId = me.Id, Role = TripMemberRole.Editor });
        ctx.Preferences.Add(new Preference { OwnerId = OwnerId, UserId = me.Id });
        ctx.ConsentSettings.Add(new ConsentSetting { OwnerId = OwnerId, UserId = me.Id, ShareEnabled = true });
        ctx.SaveChanges();

        var deleted = await new AccountDeletionService(ctx).DeleteAccountAsync(OwnerId);

        Assert.True(deleted);
        Assert.All(ctx.TripMembers.Where(m => m.UserId == me.Id), m => Assert.NotNull(m.DeletedAt));
        Assert.All(ctx.Preferences.Where(p => p.UserId == me.Id), p => Assert.NotNull(p.DeletedAt));
        Assert.All(ctx.ConsentSettings.Where(c => c.UserId == me.Id), c => Assert.NotNull(c.DeletedAt));
        // The other user's trip itself is untouched — only my membership on it was cleared.
        Assert.Null(ctx.Trips.Single(t => t.Id == othersTrip.Id).DeletedAt);
    }

    [Fact]
    public async Task DeleteAccountAsync_AnonymizesUserAndFreesIdentityForResignup()
    {
        using var ctx = NewContext();
        var users = new UserService(ctx);
        var original = users.GetOrCreate(OwnerId);
        var originalEmail = original.Email;

        var deleted = await new AccountDeletionService(ctx).DeleteAccountAsync(OwnerId);
        Assert.True(deleted);

        var row = ctx.Users.Single(u => u.Id == original.Id);
        Assert.NotNull(row.DeletedAt);
        Assert.NotEqual(OwnerId, row.OwnerId);
        Assert.NotEqual(originalEmail, row.Email);
        Assert.Equal("Deleted User", row.DisplayName);

        // The original OwnerId is free again — GetOrCreate makes a brand-new row, not a duplicate/conflict.
        var reSignedUp = users.GetOrCreate(OwnerId);
        Assert.NotEqual(original.Id, reSignedUp.Id);
        Assert.Null(reSignedUp.DeletedAt);
    }

    [Fact]
    public async Task DeleteMe_Controller_ReturnsNoContentAndDeletesData()
    {
        using var ctx = NewContext();
        new UserService(ctx).GetOrCreate(OwnerId);
        var trip = new EfCoreTripRepository(ctx).Add(new Trip
        {
            OwnerId = OwnerId,
            Title = "Sicily",
            Destination = "Sicily, Italy",
            StartDate = new DateOnly(2026, 5, 1),
            EndDate = new DateOnly(2026, 5, 5),
            Currency = "EUR",
        });

        var ctrl = new UsersController(new AccountDeletionService(ctx))
        {
            ControllerContext = FakeAuth.ForUser(OwnerId),
        };

        var result = await ctrl.DeleteMe(default);

        Assert.IsType<NoContentResult>(result);
        Assert.NotNull(ctx.Trips.Single(t => t.Id == trip.Id).DeletedAt);
    }

    [Fact]
    public async Task DeleteMe_Controller_UnknownAccount_ReturnsNotFound()
    {
        using var ctx = NewContext();
        var ctrl = new UsersController(new AccountDeletionService(ctx))
        {
            ControllerContext = FakeAuth.ForUser("never-signed-up"),
        };

        var result = await ctrl.DeleteMe(default);

        Assert.IsType<NotFoundResult>(result);
    }
}
