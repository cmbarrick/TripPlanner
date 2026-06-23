using Microsoft.EntityFrameworkCore;
using Wander.Api.Data;
using Wander.Api.Models;

namespace Wander.Api.Tests;

/// <summary>
/// Phase 7 (Slices 0–1): trip access resolution + link-based sharing, exercised against the EF
/// Core in-memory provider across fresh contexts (mirrors <see cref="EfCoreTripRepositoryTests"/>).
/// </summary>
public class TripSharingTests
{
    private static WanderDbContext NewContext(string databaseName) =>
        new(new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(databaseName)
            .EnableSensitiveDataLogging()
            .Options);

    private static Trip SampleTrip(string ownerId) => new()
    {
        OwnerId = ownerId,
        Title = "Sharable Trip",
        Destination = "Lisbon, Portugal",
        StartDate = new DateOnly(2026, 7, 1),
        EndDate = new DateOnly(2026, 7, 3),
        Travelers = 2,
        CoverTheme = "lisbon",
        EstimatedCost = 800m,
        Currency = "EUR",
        Days = [new Day { DayNumber = 1, Date = new DateOnly(2026, 7, 1) }],
    };

    private static Guid SeedTrip(string db, string ownerId)
    {
        using var ctx = NewContext(db);
        return new EfCoreTripRepository(ctx).Add(SampleTrip(ownerId)).Id;
    }

    // ---- TripAccessService ------------------------------------------------

    [Fact]
    public void Resolve_OwnerGetsOwnerRole()
    {
        var db = Guid.NewGuid().ToString();
        var tripId = SeedTrip(db, "owner-a");

        using var ctx = NewContext(db);
        var access = new TripAccessService(ctx, new UserService(ctx)).Resolve(tripId, "owner-a");

        Assert.NotNull(access);
        Assert.Equal(TripMemberRole.Owner, access!.Role);
        Assert.Equal("owner-a", access.TripOwnerId);
        Assert.True(access.CanManage);
        Assert.True(access.CanEdit);
    }

    [Fact]
    public void Resolve_NonMemberGetsNoAccess()
    {
        var db = Guid.NewGuid().ToString();
        var tripId = SeedTrip(db, "owner-a");

        using var ctx = NewContext(db);
        Assert.Null(new TripAccessService(ctx, new UserService(ctx)).Resolve(tripId, "stranger"));
    }

    [Fact]
    public void Resolve_MissingOrDeletedTripGivesNoAccess()
    {
        var db = Guid.NewGuid().ToString();
        var tripId = SeedTrip(db, "owner-a");

        using (var ctx = NewContext(db))
            new EfCoreTripRepository(ctx).Delete(tripId, "owner-a");

        using var verify = NewContext(db);
        Assert.Null(new TripAccessService(verify, new UserService(verify)).Resolve(tripId, "owner-a"));
        Assert.Null(new TripAccessService(verify, new UserService(verify)).Resolve(Guid.NewGuid(), "owner-a"));
    }

    [Fact]
    public void Resolve_EditorMemberGetsEditorRole()
    {
        var db = Guid.NewGuid().ToString();
        var tripId = SeedTrip(db, "owner-a");

        // Redeem an editor link to create the membership, then resolve.
        using (var ctx = NewContext(db))
        {
            var link = new TripShareService(ctx, new EfCoreTripRepository(ctx), new UserService(ctx))
                .CreateLink(tripId, "owner-a", TripMemberRole.Editor, null);
            new TripShareService(ctx, new EfCoreTripRepository(ctx), new UserService(ctx))
                .Redeem(link.Token, "friend-b");
        }

        using var verify = NewContext(db);
        var access = new TripAccessService(verify, new UserService(verify)).Resolve(tripId, "friend-b");
        Assert.NotNull(access);
        Assert.Equal(TripMemberRole.Editor, access!.Role);
        Assert.True(access.CanEdit);
        Assert.False(access.CanManage);
        // Access resolves against the trip owner's partition, not the caller.
        Assert.Equal("owner-a", access.TripOwnerId);
    }

    // ---- TripShareService: link lifecycle ---------------------------------

    [Fact]
    public void CreateLink_IssuesUnguessableTokenAndUrl()
    {
        var db = Guid.NewGuid().ToString();
        var tripId = SeedTrip(db, "owner-a");

        using var ctx = NewContext(db);
        var link = new TripShareService(ctx, new EfCoreTripRepository(ctx), new UserService(ctx))
            .CreateLink(tripId, "owner-a", TripMemberRole.Viewer, null);

        Assert.False(string.IsNullOrWhiteSpace(link.Token));
        Assert.Equal(40, link.Token.Length); // 20 random bytes, hex-encoded
        Assert.Equal($"/api/shared/trips/{link.Token}", link.ShareUrl);
        Assert.Equal(TripMemberRole.Viewer, link.Role);
    }

    [Fact]
    public void GetSharedTrip_ReturnsTripForValidToken_NullForExpiredOrRevoked()
    {
        var db = Guid.NewGuid().ToString();
        var tripId = SeedTrip(db, "owner-a");

        string validToken, expiredToken, revokedToken;
        Guid revokedId;
        using (var ctx = NewContext(db))
        {
            var svc = new TripShareService(ctx, new EfCoreTripRepository(ctx), new UserService(ctx));
            validToken = svc.CreateLink(tripId, "owner-a", TripMemberRole.Viewer, null).Token;
            expiredToken = svc.CreateLink(tripId, "owner-a", TripMemberRole.Viewer,
                DateTimeOffset.UtcNow.AddMinutes(-1)).Token;
            var revoked = svc.CreateLink(tripId, "owner-a", TripMemberRole.Viewer, null);
            revokedToken = revoked.Token;
            revokedId = revoked.Id;
        }

        using (var ctx = NewContext(db))
            Assert.True(new TripShareService(ctx, new EfCoreTripRepository(ctx), new UserService(ctx))
                .RevokeLink(tripId, revokedId));

        using var verify = NewContext(db);
        var svc2 = new TripShareService(verify, new EfCoreTripRepository(verify), new UserService(verify));
        var shared = svc2.GetSharedTrip(validToken);
        Assert.NotNull(shared);
        Assert.Equal(tripId, shared!.Trip.Id);
        Assert.Equal(TripMemberRole.Viewer, shared.Role);

        Assert.Null(svc2.GetSharedTrip(expiredToken));
        Assert.Null(svc2.GetSharedTrip(revokedToken));
        Assert.Null(svc2.GetSharedTrip("not-a-real-token"));
        // ListLinks shows non-revoked links to the owner (incl. expired), so the revoked one is gone
        // but the valid + expired links remain.
        Assert.Equal(2, svc2.ListLinks(tripId).Count);
    }

    [Fact]
    public void Redeem_CreatesMembership_IsNoOpForOwner_AndNotFoundForBadToken()
    {
        var db = Guid.NewGuid().ToString();
        var tripId = SeedTrip(db, "owner-a");

        string token;
        using (var ctx = NewContext(db))
            token = new TripShareService(ctx, new EfCoreTripRepository(ctx), new UserService(ctx))
                .CreateLink(tripId, "owner-a", TripMemberRole.Editor, null).Token;

        using (var ctx = NewContext(db))
        {
            var svc = new TripShareService(ctx, new EfCoreTripRepository(ctx), new UserService(ctx));

            var redeemed = svc.Redeem(token, "friend-b");
            Assert.Equal(RedeemStatus.Redeemed, redeemed.Status);
            Assert.Equal(tripId, redeemed.TripId);
            Assert.Equal(TripMemberRole.Editor, redeemed.Role);

            var ownerRedeem = svc.Redeem(token, "owner-a");
            Assert.Equal(RedeemStatus.AlreadyOwner, ownerRedeem.Status);

            var bad = svc.Redeem("nope", "friend-c");
            Assert.Equal(RedeemStatus.NotFound, bad.Status);
        }

        // Re-redeeming should not create a duplicate membership row.
        using (var ctx = NewContext(db))
            new TripShareService(ctx, new EfCoreTripRepository(ctx), new UserService(ctx)).Redeem(token, "friend-b");

        using var verify = NewContext(db);
        var userId = new UserService(verify).FindUserId("friend-b");
        Assert.NotNull(userId);
        Assert.Single(verify.TripMembers.Where(m => m.TripId == tripId && m.UserId == userId && m.DeletedAt == null));
    }

    // ---- ListMemberships (shared trips in the list) -----------------------

    [Fact]
    public void ListMemberships_ReturnsSharedTrips_ExcludingOwned()
    {
        var db = Guid.NewGuid().ToString();
        var ownedByA = SeedTrip(db, "owner-a");
        var ownedByB = SeedTrip(db, "owner-b");

        // friend-b is the owner of ownedByB and a member (editor) of ownedByA.
        using (var ctx = NewContext(db))
        {
            var token = new TripShareService(ctx, new EfCoreTripRepository(ctx), new UserService(ctx))
                .CreateLink(ownedByA, "owner-a", TripMemberRole.Editor, null).Token;
            new TripShareService(ctx, new EfCoreTripRepository(ctx), new UserService(ctx))
                .Redeem(token, "owner-b");
        }

        using var verify = NewContext(db);
        var memberships = new TripAccessService(verify, new UserService(verify)).ListMemberships("owner-b");

        var shared = Assert.Single(memberships);
        Assert.Equal(ownedByA, shared.TripId);
        Assert.Equal("owner-a", shared.TripOwnerId);
        Assert.Equal(TripMemberRole.Editor, shared.Role);
        // The trip owner-b actually owns is not returned as a "membership".
        Assert.DoesNotContain(memberships, m => m.TripId == ownedByB);
    }

    // ---- TripMemberService: account management ----------------------------

    [Fact]
    public void InviteByEmail_AddsRegisteredUser_UpdatesRole_AndRemoves()
    {
        var db = Guid.NewGuid().ToString();
        var tripId = SeedTrip(db, "owner-a");

        // Register the invitee (lazy-create gives them a deterministic dev email).
        string inviteeEmail;
        using (var ctx = NewContext(db))
            inviteeEmail = new UserService(ctx).GetOrCreate("friend-b").Email;

        Guid memberId;
        using (var ctx = NewContext(db))
        {
            var svc = new TripMemberService(ctx);
            var outcome = svc.InviteByEmail(tripId, "owner-a", inviteeEmail.ToUpperInvariant(), TripMemberRole.Viewer);
            Assert.Equal(InviteStatus.Invited, outcome.Status);
            Assert.NotNull(outcome.Member);
            Assert.Equal(TripMemberRole.Viewer, outcome.Member!.Role);
            memberId = outcome.Member.Id;
        }

        using (var ctx = NewContext(db))
        {
            var svc = new TripMemberService(ctx);
            Assert.Single(svc.ListMembers(tripId));
            Assert.True(svc.ChangeRole(tripId, memberId, TripMemberRole.Editor));
        }

        using (var ctx = NewContext(db))
        {
            var svc = new TripMemberService(ctx);
            Assert.Equal(TripMemberRole.Editor, svc.ListMembers(tripId).Single().Role);
            Assert.True(svc.RemoveMember(tripId, memberId));
            Assert.Empty(svc.ListMembers(tripId));
        }
    }

    [Fact]
    public void InviteByEmail_ReportsUnknownUser_AndRejectsOwner()
    {
        var db = Guid.NewGuid().ToString();
        var tripId = SeedTrip(db, "owner-a");

        string ownerEmail;
        using (var ctx = NewContext(db))
            ownerEmail = new UserService(ctx).GetOrCreate("owner-a").Email;

        using var ctx2 = NewContext(db);
        var svc = new TripMemberService(ctx2);

        Assert.Equal(InviteStatus.UserNotFound,
            svc.InviteByEmail(tripId, "owner-a", "nobody@example.com", TripMemberRole.Viewer).Status);
        Assert.Equal(InviteStatus.AlreadyOwner,
            svc.InviteByEmail(tripId, "owner-a", ownerEmail, TripMemberRole.Viewer).Status);
    }
}
