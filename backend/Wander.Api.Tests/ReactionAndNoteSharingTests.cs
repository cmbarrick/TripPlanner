using Microsoft.EntityFrameworkCore;
using Wander.Api.Data;
using Wander.Api.Models;

namespace Wander.Api.Tests;

/// <summary>
/// Phase 7 (Slice 4): emoji reactions and shared notes-as-comments, exercised against the EF Core
/// in-memory provider across fresh contexts (mirrors <see cref="TripSharingTests"/>).
/// </summary>
public class ReactionAndNoteSharingTests
{
    private static WanderDbContext NewContext(string databaseName) =>
        new(new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(databaseName)
            .EnableSensitiveDataLogging()
            .Options);

    private static Guid SeedTrip(string db, string ownerId)
    {
        using var ctx = NewContext(db);
        return new EfCoreTripRepository(ctx).Add(new Trip
        {
            OwnerId = ownerId,
            Title = "Reactable Trip",
            Destination = "Kyoto, Japan",
            StartDate = new DateOnly(2026, 9, 1),
            EndDate = new DateOnly(2026, 9, 4),
            Travelers = 2,
            Days = [new Day { DayNumber = 1, Date = new DateOnly(2026, 9, 1) }],
        }).Id;
    }

    private static void ShareEditor(string db, Guid tripId, string ownerId, string memberOwnerId)
    {
        using var ctx = NewContext(db);
        var token = new TripShareService(ctx, new EfCoreTripRepository(ctx), new UserService(ctx))
            .CreateLink(tripId, ownerId, TripMemberRole.Editor, null).Token;
        new TripShareService(ctx, new EfCoreTripRepository(ctx), new UserService(ctx))
            .Redeem(token, memberOwnerId);
    }

    // ---- ReactionService --------------------------------------------------

    [Fact]
    public void Toggle_AddsThenRemovesSameReaction()
    {
        var db = Guid.NewGuid().ToString();
        var tripId = SeedTrip(db, "owner-a");

        using (var ctx = NewContext(db))
        {
            var first = new ReactionService(ctx)
                .Toggle(tripId, "owner-a", ReactionTargetType.Trip, tripId, "🎉");
            Assert.True(first.Added);
        }

        using (var ctx = NewContext(db))
            Assert.Single(new ReactionService(ctx).ListForTrip(tripId));

        using (var ctx = NewContext(db))
        {
            var second = new ReactionService(ctx)
                .Toggle(tripId, "owner-a", ReactionTargetType.Trip, tripId, "🎉");
            Assert.False(second.Added);
        }

        using var verify = NewContext(db);
        Assert.Empty(new ReactionService(verify).ListForTrip(tripId));
    }

    [Fact]
    public void Toggle_RevivesSoftDeletedReaction_WithoutDuplicates()
    {
        var db = Guid.NewGuid().ToString();
        var tripId = SeedTrip(db, "owner-a");

        var svcDb = NewContext(db);
        var svc = new ReactionService(svcDb);
        svc.Toggle(tripId, "owner-a", ReactionTargetType.Trip, tripId, "👍"); // add
        svc.Toggle(tripId, "owner-a", ReactionTargetType.Trip, tripId, "👍"); // remove
        var revived = svc.Toggle(tripId, "owner-a", ReactionTargetType.Trip, tripId, "👍"); // re-add
        svcDb.Dispose();

        Assert.True(revived.Added);

        using var verify = NewContext(db);
        // Exactly one physical row exists (revived rather than duplicated).
        Assert.Single(verify.Reactions.Where(r => r.TripId == tripId));
        Assert.Single(new ReactionService(verify).ListForTrip(tripId));
    }

    [Fact]
    public void List_ReturnsReactionsFromMultipleMembersAndTargets()
    {
        var db = Guid.NewGuid().ToString();
        var tripId = SeedTrip(db, "owner-a");
        var itemId = Guid.NewGuid();

        using (var ctx = NewContext(db))
        {
            var svc = new ReactionService(ctx);
            svc.Toggle(tripId, "owner-a", ReactionTargetType.Trip, tripId, "🎉");
            svc.Toggle(tripId, "friend-b", ReactionTargetType.Item, itemId, "❤️");
        }

        using var verify = NewContext(db);
        var all = new ReactionService(verify).ListForTrip(tripId);
        Assert.Equal(2, all.Count);
        Assert.Contains(all, r => r.OwnerId == "friend-b" && r.TargetType == ReactionTargetType.Item);
    }

    // ---- Shared notes (comments) ------------------------------------------

    [Fact]
    public void GetAllForTrip_ReturnsNotesFromOwnerAndMembers()
    {
        var db = Guid.NewGuid().ToString();
        var tripId = SeedTrip(db, "owner-a");
        ShareEditor(db, tripId, "owner-a", "friend-b");

        using (var ctx = NewContext(db))
        {
            var notes = new EfCoreNoteRepository(ctx);
            notes.AddAuthored(tripId, "owner-a", new Note { BodyText = "Owner note" });
            notes.AddAuthored(tripId, "friend-b", new Note { BodyText = "Member comment" });
        }

        using var verify = NewContext(db);
        var all = new EfCoreNoteRepository(verify).GetAllForTrip(tripId).ToList();
        Assert.Equal(2, all.Count);
        Assert.Contains(all, n => n.OwnerId == "friend-b" && n.BodyText == "Member comment");
        // Owner-scoped read still only returns the owner's own notes.
        Assert.Single(new EfCoreNoteRepository(verify).GetForTrip(tripId, "owner-a"));
    }

    [Fact]
    public void GetTripIdForMediaAsset_AndForNote_ResolveCorrectly()
    {
        var db = Guid.NewGuid().ToString();
        var tripId = SeedTrip(db, "owner-a");

        Guid noteId, mediaId = Guid.NewGuid();
        using (var ctx = NewContext(db))
        {
            var created = new EfCoreNoteRepository(ctx).AddAuthored(tripId, "friend-b", new Note
            {
                Kind = NoteKind.Voice,
                MediaAssets = [new MediaAsset { Id = mediaId, Kind = MediaAssetKind.Audio, BlobName = "x" }],
            });
            noteId = created.Id;
        }

        using var verify = NewContext(db);
        var repo = new EfCoreNoteRepository(verify);
        Assert.Equal(tripId, repo.GetTripIdForMediaAsset(mediaId));
        Assert.Equal(tripId, repo.GetTripIdForNote(noteId, "friend-b"));
        // Not the author → no match (delete stays owner-scoped).
        Assert.Null(repo.GetTripIdForNote(noteId, "owner-a"));
        Assert.Null(repo.GetTripIdForMediaAsset(Guid.NewGuid()));
    }
}
