using Microsoft.EntityFrameworkCore;
using Wander.Api.Data;
using Wander.Api.Models;

namespace Wander.Api.Tests;

/// <summary>
/// Integration-style tests for the production EF Core repository, exercised against the
/// EF Core in-memory provider. They cover the full trip CRUD lifecycle (persistence across
/// fresh contexts), soft-delete behavior, and per-user ownership deny cases.
/// </summary>
public class EfCoreTripRepositoryTests
{
    private static WanderDbContext NewContext(string databaseName) =>
        new(new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(databaseName)
            .EnableSensitiveDataLogging()
            .Options);

    private static Trip SampleTrip(string ownerId, string title = "Test Trip") => new()
    {
        OwnerId = ownerId,
        Title = title,
        Destination = "Lisbon, Portugal",
        StartDate = new DateOnly(2026, 7, 1),
        EndDate = new DateOnly(2026, 7, 5),
        Travelers = 2,
        CoverTheme = "lisbon",
        EstimatedCost = 1200m,
        Currency = "EUR",
        Days =
        [
            new Day { DayNumber = 1, Date = new DateOnly(2026, 7, 1) }
        ]
    };

    [Fact]
    public void Add_PersistsTrip_AndIsReadableFromAFreshContext()
    {
        var db = Guid.NewGuid().ToString();

        Guid createdId;
        using (var ctx = NewContext(db))
        {
            var created = new EfCoreTripRepository(ctx).Add(SampleTrip("owner-a"));
            createdId = created.Id;
            Assert.NotEqual(Guid.Empty, created.Id);
            Assert.Single(created.Days);
        }

        using (var ctx = NewContext(db))
        {
            var loaded = new EfCoreTripRepository(ctx).GetById(createdId, "owner-a");
            Assert.NotNull(loaded);
            Assert.Equal("Test Trip", loaded!.Title);
            Assert.Equal("owner-a", loaded.OwnerId);
            Assert.Single(loaded.Days);
            Assert.Equal("owner-a", loaded.Days[0].OwnerId);
        }
    }

    [Fact]
    public void GetAll_ReturnsOnlyTripsForOwner_OrderedByStartDate()
    {
        var db = Guid.NewGuid().ToString();
        using var ctx = NewContext(db);
        var repo = new EfCoreTripRepository(ctx);

        var later = SampleTrip("owner-a", "Later");
        later.StartDate = new DateOnly(2026, 9, 1);
        later.EndDate = new DateOnly(2026, 9, 3);
        var earlier = SampleTrip("owner-a", "Earlier");
        earlier.StartDate = new DateOnly(2026, 3, 1);
        earlier.EndDate = new DateOnly(2026, 3, 3);

        repo.Add(later);
        repo.Add(earlier);
        repo.Add(SampleTrip("owner-b", "Other Owner"));

        var ownerATrips = repo.GetAll("owner-a").ToList();

        Assert.Equal(2, ownerATrips.Count);
        Assert.All(ownerATrips, t => Assert.Equal("owner-a", t.OwnerId));
        Assert.Equal("Earlier", ownerATrips[0].Title);
        Assert.Equal("Later", ownerATrips[1].Title);
    }

    [Fact]
    public void GetById_DeniesAccessForNonOwner()
    {
        var db = Guid.NewGuid().ToString();
        using var ctx = NewContext(db);
        var repo = new EfCoreTripRepository(ctx);

        var created = repo.Add(SampleTrip("owner-a"));

        Assert.Null(repo.GetById(created.Id, "owner-b"));
        Assert.NotNull(repo.GetById(created.Id, "owner-a"));
    }

    [Fact]
    public void Update_PersistsChanges_AndIsScopedToOwner()
    {
        var db = Guid.NewGuid().ToString();
        Guid id;
        using (var ctx = NewContext(db))
        {
            id = new EfCoreTripRepository(ctx).Add(SampleTrip("owner-a")).Id;
        }

        using (var ctx = NewContext(db))
        {
            var updated = new EfCoreTripRepository(ctx).Update(id, "owner-a", new Trip
            {
                Title = "Renamed",
                Destination = "Porto, Portugal",
                StartDate = new DateOnly(2026, 7, 2),
                EndDate = new DateOnly(2026, 7, 9),
                Travelers = 4,
                CoverTheme = "porto",
                EstimatedCost = 1500m,
                Currency = "USD"
            });

            Assert.NotNull(updated);
            Assert.Equal("Renamed", updated!.Title);
            Assert.Equal("Porto, Portugal", updated.Destination);
            Assert.Equal(4, updated.Travelers);
            Assert.Equal("USD", updated.Currency);
        }

        using (var ctx = NewContext(db))
        {
            var reloaded = new EfCoreTripRepository(ctx).GetById(id, "owner-a");
            Assert.Equal("Renamed", reloaded!.Title);
            Assert.Equal(7, reloaded.Nights);
        }
    }

    [Fact]
    public void Update_DeniesWhenOwnerDoesNotMatch()
    {
        var db = Guid.NewGuid().ToString();
        using var ctx = NewContext(db);
        var repo = new EfCoreTripRepository(ctx);
        var created = repo.Add(SampleTrip("owner-a"));

        var denied = repo.Update(created.Id, "owner-b", SampleTrip("owner-b", "Hijacked"));

        Assert.Null(denied);
        Assert.Equal("Test Trip", repo.GetById(created.Id, "owner-a")!.Title);
    }

    [Fact]
    public void Delete_SoftDeletesTrip_AndCascadesToDaysAndItems()
    {
        var db = Guid.NewGuid().ToString();
        Guid id;
        Guid dayId;
        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            var created = repo.Add(SampleTrip("owner-a"));
            id = created.Id;
            dayId = created.Days[0].Id;
            repo.AddItem(id, "owner-a", dayId, new ItineraryItem { Title = "Museum" });
        }

        using (var ctx = NewContext(db))
        {
            Assert.True(new EfCoreTripRepository(ctx).Delete(id, "owner-a"));
        }

        using (var ctx = NewContext(db))
        {
            Assert.Null(new EfCoreTripRepository(ctx).GetById(id, "owner-a"));
            Assert.Empty(new EfCoreTripRepository(ctx).GetAll("owner-a"));
            Assert.All(ctx.Days.IgnoreQueryFilters().Where(d => d.TripId == id),
                d => Assert.NotNull(d.DeletedAt));
            Assert.All(ctx.ItineraryItems.IgnoreQueryFilters().Where(i => i.DayId == dayId),
                i => Assert.NotNull(i.DeletedAt));
        }
    }

    [Fact]
    public void Delete_DeniesWhenOwnerDoesNotMatch()
    {
        var db = Guid.NewGuid().ToString();
        using var ctx = NewContext(db);
        var repo = new EfCoreTripRepository(ctx);
        var created = repo.Add(SampleTrip("owner-a"));

        Assert.False(repo.Delete(created.Id, "owner-b"));
        Assert.True(repo.Delete(created.Id, "owner-a"));
    }

    [Fact]
    public void AddItem_DeniesWhenOwnerDoesNotMatch()
    {
        var db = Guid.NewGuid().ToString();
        using var ctx = NewContext(db);
        var repo = new EfCoreTripRepository(ctx);
        var created = repo.Add(SampleTrip("owner-a"));
        var dayId = created.Days[0].Id;

        var denied = repo.AddItem(created.Id, "owner-b", dayId, new ItineraryItem { Title = "Blocked" });
        var allowed = repo.AddItem(created.Id, "owner-a", dayId, new ItineraryItem { Title = "Allowed" });

        Assert.Null(denied);
        Assert.NotNull(allowed);
        Assert.Equal("owner-a", allowed!.OwnerId);
    }

    [Fact]
    public void DeleteItem_DeniesWhenOwnerDoesNotMatch()
    {
        var db = Guid.NewGuid().ToString();
        using var ctx = NewContext(db);
        var repo = new EfCoreTripRepository(ctx);
        var created = repo.Add(SampleTrip("owner-a"));
        var dayId = created.Days[0].Id;
        var item = repo.AddItem(created.Id, "owner-a", dayId, new ItineraryItem { Title = "Tour" });

        Assert.False(repo.DeleteItem(created.Id, "owner-b", item!.Id));
        Assert.True(repo.DeleteItem(created.Id, "owner-a", item.Id));
    }

    [Fact]
    public void UpdateItem_PersistsFieldChanges_AndDeniesForNonOwner()
    {
        var db = Guid.NewGuid().ToString();
        Guid tripId;
        Guid itemId;
        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            var created = repo.Add(SampleTrip("owner-a"));
            tripId = created.Id;
            var item = repo.AddItem(tripId, "owner-a", created.Days[0].Id,
                new ItineraryItem { Title = "Old", Cost = 10m, Currency = "EUR" });
            itemId = item!.Id;
        }

        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            Assert.Null(repo.UpdateItem(tripId, "owner-b", itemId,
                new ItineraryItem { Title = "Hijack", Currency = "EUR" }));

            var updated = repo.UpdateItem(tripId, "owner-a", itemId, new ItineraryItem
            {
                Type = ItineraryItemType.Food,
                Title = "New Title",
                Cost = 42m,
                Currency = "USD",
                LocationName = "Cafe"
            });
            Assert.NotNull(updated);
            Assert.Equal("New Title", updated!.Title);
            Assert.Equal(ItineraryItemType.Food, updated.Type);
            Assert.Equal(42m, updated.Cost);
            Assert.Equal("USD", updated.Currency);
        }

        using (var ctx = NewContext(db))
        {
            var trip = new EfCoreTripRepository(ctx).GetById(tripId, "owner-a");
            var item = trip!.Days[0].Items.Single();
            Assert.Equal("New Title", item.Title);
            Assert.Equal("Cafe", item.LocationName);
        }
    }

    [Fact]
    public void ReorderDayItems_PersistsNewOrder()
    {
        var db = Guid.NewGuid().ToString();
        Guid tripId;
        Guid dayId;
        Guid a, b, c;
        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            var created = repo.Add(SampleTrip("owner-a"));
            tripId = created.Id;
            dayId = created.Days[0].Id;
            a = repo.AddItem(tripId, "owner-a", dayId, new ItineraryItem { Title = "A" })!.Id;
            b = repo.AddItem(tripId, "owner-a", dayId, new ItineraryItem { Title = "B" })!.Id;
            c = repo.AddItem(tripId, "owner-a", dayId, new ItineraryItem { Title = "C" })!.Id;
        }

        using (var ctx = NewContext(db))
        {
            Assert.True(new EfCoreTripRepository(ctx).ReorderDayItems(tripId, "owner-a", dayId, new[] { c, a, b }));
        }

        using (var ctx = NewContext(db))
        {
            var day = new EfCoreTripRepository(ctx).GetById(tripId, "owner-a")!.Days[0];
            Assert.Equal(new[] { "C", "A", "B" }, day.Items.Select(i => i.Title).ToArray());
        }
    }

    [Fact]
    public void ReorderDayItems_DeniesForNonOwner()
    {
        var db = Guid.NewGuid().ToString();
        using var ctx = NewContext(db);
        var repo = new EfCoreTripRepository(ctx);
        var created = repo.Add(SampleTrip("owner-a"));
        var dayId = created.Days[0].Id;
        var item = repo.AddItem(created.Id, "owner-a", dayId, new ItineraryItem { Title = "A" })!;

        Assert.False(repo.ReorderDayItems(created.Id, "owner-b", dayId, new[] { item.Id }));
    }

    [Fact]
    public void MoveItem_RelocatesToAnotherDay_AndDeniesForNonOwner()
    {
        var db = Guid.NewGuid().ToString();
        var trip = new Trip
        {
            OwnerId = "owner-a",
            Title = "Two Day Trip",
            Destination = "Rome",
            StartDate = new DateOnly(2026, 7, 1),
            EndDate = new DateOnly(2026, 7, 2),
            Currency = "EUR",
            CoverTheme = "lisbon",
            Days =
            [
                new Day { DayNumber = 1, Date = new DateOnly(2026, 7, 1) },
                new Day { DayNumber = 2, Date = new DateOnly(2026, 7, 2) }
            ]
        };

        Guid tripId, day1, day2, itemId;
        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            var created = repo.Add(trip);
            tripId = created.Id;
            day1 = created.Days[0].Id;
            day2 = created.Days[1].Id;
            itemId = repo.AddItem(tripId, "owner-a", day1, new ItineraryItem { Title = "Movable" })!.Id;
        }

        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            Assert.Null(repo.MoveItem(tripId, "owner-b", itemId, day2));
            var moved = repo.MoveItem(tripId, "owner-a", itemId, day2);
            Assert.NotNull(moved);
            Assert.Equal(day2, moved!.DayId);
        }

        using (var ctx = NewContext(db))
        {
            var trip2 = new EfCoreTripRepository(ctx).GetById(tripId, "owner-a")!;
            Assert.Empty(trip2.Days[0].Items);
            Assert.Single(trip2.Days[1].Items);
        }
    }

    [Fact]
    public void PackingItems_AddToggleListDelete_WithOwnershipChecks()
    {
        var db = Guid.NewGuid().ToString();
        Guid tripId;
        Guid packingId;
        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            tripId = repo.Add(SampleTrip("owner-a")).Id;

            Assert.Null(repo.AddPackingItem(tripId, "owner-b", "Sneaky"));
            var added = repo.AddPackingItem(tripId, "owner-a", "Passport");
            Assert.NotNull(added);
            Assert.False(added!.IsPacked);
            packingId = added.Id;
        }

        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            Assert.Null(repo.SetPackingItemPacked(tripId, "owner-b", packingId, true));
            var toggled = repo.SetPackingItemPacked(tripId, "owner-a", packingId, true);
            Assert.True(toggled!.IsPacked);
        }

        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            var items = repo.GetPackingItems(tripId, "owner-a").ToList();
            Assert.Single(items);
            Assert.True(items[0].IsPacked);
            Assert.Empty(repo.GetPackingItems(tripId, "owner-b"));

            Assert.False(repo.DeletePackingItem(tripId, "owner-b", packingId));
            Assert.True(repo.DeletePackingItem(tripId, "owner-a", packingId));
            Assert.Empty(repo.GetPackingItems(tripId, "owner-a"));
        }
    }
}
