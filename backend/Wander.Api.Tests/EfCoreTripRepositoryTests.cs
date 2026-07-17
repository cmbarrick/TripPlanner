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
            Assert.Equal(8, reloaded.Days.Count);
            Assert.Equal(new DateOnly(2026, 7, 2), reloaded.Days[0].Date);
            Assert.Equal(new DateOnly(2026, 7, 9), reloaded.Days[^1].Date);
        }
    }

    [Fact]
    public void Update_ShorteningDates_RemovesExtraDays()
    {
        var db = Guid.NewGuid().ToString();
        Guid id;
        using (var ctx = NewContext(db))
        {
            var trip = SampleTrip("owner-a");
            trip.StartDate = new DateOnly(2026, 7, 1);
            trip.EndDate = new DateOnly(2026, 7, 31);
            trip.Days = [];
            for (var n = 1; n <= 31; n++)
                trip.Days.Add(new Day { DayNumber = n, Date = trip.StartDate.AddDays(n - 1) });
            id = new EfCoreTripRepository(ctx).Add(trip).Id;
        }

        using (var ctx = NewContext(db))
        {
            var updated = new EfCoreTripRepository(ctx).Update(id, "owner-a", new Trip
            {
                Title = "Short",
                Destination = "Los Angeles",
                StartDate = new DateOnly(2026, 6, 24),
                EndDate = new DateOnly(2026, 6, 27),
                Travelers = 1,
                CoverTheme = "default",
                Currency = "USD",
            });
            Assert.NotNull(updated);
            Assert.Equal(4, updated!.Days.Count);
            Assert.Equal(new DateOnly(2026, 6, 24), updated.Days[0].Date);
            Assert.Equal(new DateOnly(2026, 6, 27), updated.Days[^1].Date);
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

    [Fact]
    public void AddUnscheduledItem_AddsToBacklog_AndIsReturnedFromFreshContext()
    {
        var db = Guid.NewGuid().ToString();
        Guid tripId;
        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            tripId = repo.Add(SampleTrip("owner-a")).Id;

            Assert.Null(repo.AddUnscheduledItem(tripId, "owner-b", new ItineraryItem { Title = "Sneaky" }));
            var idea = repo.AddUnscheduledItem(tripId, "owner-a", new ItineraryItem { Title = "Valley of the Temples" });
            Assert.NotNull(idea);
            Assert.Null(idea!.DayId);
            Assert.Equal(tripId, idea.TripId);
            // Defaults to Wishlist when created in the backlog.
            Assert.Equal(ItineraryItemStatus.Wishlist, idea.Status);
        }

        using (var ctx = NewContext(db))
        {
            var trip = new EfCoreTripRepository(ctx).GetById(tripId, "owner-a")!;
            Assert.Single(trip.UnscheduledItems);
            Assert.Empty(trip.Days[0].Items);
            Assert.Equal("Valley of the Temples", trip.UnscheduledItems[0].Title);
        }
    }

    [Fact]
    public void MoveItem_SchedulesFromBacklog_AndUnschedulesBackToBacklog()
    {
        var db = Guid.NewGuid().ToString();
        Guid tripId, dayId, itemId;
        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            var created = repo.Add(SampleTrip("owner-a"));
            tripId = created.Id;
            dayId = created.Days[0].Id;
            itemId = repo.AddUnscheduledItem(tripId, "owner-a", new ItineraryItem { Title = "Etna tour" })!.Id;
        }

        // Schedule onto a day.
        using (var ctx = NewContext(db))
        {
            var moved = new EfCoreTripRepository(ctx).MoveItem(tripId, "owner-a", itemId, dayId);
            Assert.Equal(dayId, moved!.DayId);
        }
        using (var ctx = NewContext(db))
        {
            var trip = new EfCoreTripRepository(ctx).GetById(tripId, "owner-a")!;
            Assert.Single(trip.Days[0].Items);
            Assert.Empty(trip.UnscheduledItems);
        }

        // Unschedule back to the backlog (null target day).
        using (var ctx = NewContext(db))
        {
            var moved = new EfCoreTripRepository(ctx).MoveItem(tripId, "owner-a", itemId, null);
            Assert.Null(moved!.DayId);
        }
        using (var ctx = NewContext(db))
        {
            var trip = new EfCoreTripRepository(ctx).GetById(tripId, "owner-a")!;
            Assert.Empty(trip.Days[0].Items);
            Assert.Single(trip.UnscheduledItems);
        }
    }

    [Fact]
    public void SetItemStatus_UpdatesStatus_AndDeniesForNonOwner()
    {
        var db = Guid.NewGuid().ToString();
        Guid tripId, itemId;
        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            var created = repo.Add(SampleTrip("owner-a"));
            tripId = created.Id;
            itemId = repo.AddItem(tripId, "owner-a", created.Days[0].Id, new ItineraryItem { Title = "Dinner" })!.Id;
        }

        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            Assert.Null(repo.SetItemStatus(tripId, "owner-b", itemId, ItineraryItemStatus.Tentative));
            var updated = repo.SetItemStatus(tripId, "owner-a", itemId, ItineraryItemStatus.Tentative);
            Assert.Equal(ItineraryItemStatus.Tentative, updated!.Status);
        }

        using (var ctx = NewContext(db))
        {
            var trip = new EfCoreTripRepository(ctx).GetById(tripId, "owner-a")!;
            Assert.Equal(ItineraryItemStatus.Tentative, trip.Days[0].Items[0].Status);
        }
    }

    [Fact]
    public void ReorderBacklog_PersistsNewOrder()
    {
        var db = Guid.NewGuid().ToString();
        Guid tripId, a, b, c;
        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            tripId = repo.Add(SampleTrip("owner-a")).Id;
            a = repo.AddUnscheduledItem(tripId, "owner-a", new ItineraryItem { Title = "A" })!.Id;
            b = repo.AddUnscheduledItem(tripId, "owner-a", new ItineraryItem { Title = "B" })!.Id;
            c = repo.AddUnscheduledItem(tripId, "owner-a", new ItineraryItem { Title = "C" })!.Id;
        }

        using (var ctx = NewContext(db))
        {
            // Null dayId targets the backlog.
            Assert.True(new EfCoreTripRepository(ctx).ReorderDayItems(tripId, "owner-a", null, new[] { c, a, b }));
        }

        using (var ctx = NewContext(db))
        {
            var trip = new EfCoreTripRepository(ctx).GetById(tripId, "owner-a")!;
            Assert.Equal(new[] { "C", "A", "B" }, trip.UnscheduledItems.Select(i => i.Title).ToArray());
        }
    }

    // ---- Optimistic concurrency (Phase 9) --------------------------------
    //
    // Postgres bumps every row's `xmin` automatically on each UPDATE (MVCC) — that's what the real
    // concurrency check compares against in production. The in-memory provider used here doesn't
    // simulate that auto-bump for a custom `xid`-typed property, so these tests bump it explicitly
    // to stand in for "someone else's write landed first"; the actual comparison-and-throw logic
    // under test (dbContext.Entry(...).Property("Version").OriginalValue vs. the stored value) is
    // the same generic EF Core SaveChanges machinery either way, not something the provider fakes.

    private static void SimulateConcurrentItemWrite(WanderDbContext ctx, Guid itemId, uint newVersion)
    {
        var tracked = ctx.ItineraryItems.Single(i => i.Id == itemId);
        ctx.Entry(tracked).Property("Version").CurrentValue = newVersion;
        ctx.SaveChanges();
    }

    private static void SimulateConcurrentTripWrite(WanderDbContext ctx, Guid tripId, uint newVersion)
    {
        var tracked = ctx.Trips.Single(t => t.Id == tripId);
        ctx.Entry(tracked).Property("Version").CurrentValue = newVersion;
        ctx.SaveChanges();
    }

    [Fact]
    public void UpdateItem_StaleVersion_ThrowsConcurrencyConflict()
    {
        var db = Guid.NewGuid().ToString();
        Guid tripId, itemId;
        uint originalVersion;
        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            var created = repo.Add(SampleTrip("owner-a"));
            tripId = created.Id;
            var item = repo.AddItem(tripId, "owner-a", created.Days[0].Id,
                new ItineraryItem { Title = "Museum", Cost = 10m, Currency = "EUR" })!;
            itemId = item.Id;
            originalVersion = item.Version;
        }

        // Someone else's edit lands first and bumps the row's version.
        using (var ctx = NewContext(db))
        {
            SimulateConcurrentItemWrite(ctx, itemId, originalVersion + 1);
        }

        // This caller is still holding the version from before that write — stale, must be rejected.
        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            Assert.Throws<ConcurrencyConflictException>(() =>
                repo.UpdateItem(tripId, "owner-a", itemId,
                    new ItineraryItem { Title = "Stale edit", Version = originalVersion, Currency = "EUR" }));
        }

        // The stale write never landed.
        using (var ctx = NewContext(db))
        {
            var trip = new EfCoreTripRepository(ctx).GetById(tripId, "owner-a")!;
            Assert.Equal("Museum", trip.Days[0].Items.Single().Title);
        }
    }

    [Fact]
    public void UpdateItem_CurrentVersion_Succeeds()
    {
        var db = Guid.NewGuid().ToString();
        Guid tripId, itemId;
        uint originalVersion;
        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            var created = repo.Add(SampleTrip("owner-a"));
            tripId = created.Id;
            var item = repo.AddItem(tripId, "owner-a", created.Days[0].Id, new ItineraryItem { Title = "V1", Currency = "EUR" })!;
            itemId = item.Id;
            originalVersion = item.Version;
        }

        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            var updated = repo.UpdateItem(tripId, "owner-a", itemId,
                new ItineraryItem { Title = "V2", Version = originalVersion, Currency = "EUR" });
            Assert.Equal("V2", updated!.Title);
        }
    }

    [Fact]
    public void Update_Trip_StaleVersion_ThrowsConcurrencyConflict()
    {
        var db = Guid.NewGuid().ToString();
        Guid tripId;
        uint originalVersion;
        using (var ctx = NewContext(db))
        {
            var created = new EfCoreTripRepository(ctx).Add(SampleTrip("owner-a"));
            tripId = created.Id;
            originalVersion = created.Version;
        }

        using (var ctx = NewContext(db))
        {
            SimulateConcurrentTripWrite(ctx, tripId, originalVersion + 1);
        }

        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            Assert.Throws<ConcurrencyConflictException>(() => repo.Update(tripId, "owner-a", new Trip
            {
                Title = "Stale rename",
                Destination = "Porto",
                StartDate = new DateOnly(2026, 7, 1),
                EndDate = new DateOnly(2026, 7, 5),
                Travelers = 2,
                CoverTheme = "porto",
                Currency = "EUR",
                Version = originalVersion,
            }));
        }

        using (var ctx = NewContext(db))
        {
            Assert.Equal("Test Trip", new EfCoreTripRepository(ctx).GetById(tripId, "owner-a")!.Title);
        }
    }

    [Fact]
    public void Update_Trip_CurrentVersion_Succeeds()
    {
        var db = Guid.NewGuid().ToString();
        Guid tripId;
        uint originalVersion;
        using (var ctx = NewContext(db))
        {
            var created = new EfCoreTripRepository(ctx).Add(SampleTrip("owner-a"));
            tripId = created.Id;
            originalVersion = created.Version;
        }

        using (var ctx = NewContext(db))
        {
            var repo = new EfCoreTripRepository(ctx);
            var updated = repo.Update(tripId, "owner-a", new Trip
            {
                Title = "Renamed",
                Destination = "Porto",
                StartDate = new DateOnly(2026, 7, 1),
                EndDate = new DateOnly(2026, 7, 5),
                Travelers = 2,
                CoverTheme = "porto",
                Currency = "EUR",
                Version = originalVersion,
            });
            Assert.Equal("Renamed", updated!.Title);
        }
    }
}
