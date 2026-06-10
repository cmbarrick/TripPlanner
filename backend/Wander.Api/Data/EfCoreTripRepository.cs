using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

public class EfCoreTripRepository(WanderDbContext dbContext) : ITripRepository
{
    public IEnumerable<Trip> GetAll(string ownerId)
    {
        var trips = QueryTrips(ownerId).OrderBy(x => x.StartDate).ToList();
        foreach (var trip in trips)
            trip.UnscheduledItems = LoadBacklog(trip.Id, ownerId);
        return trips;
    }

    public Trip? GetById(Guid id, string ownerId)
    {
        var trip = QueryTrips(ownerId).SingleOrDefault(x => x.Id == id);
        if (trip is not null)
            trip.UnscheduledItems = LoadBacklog(trip.Id, ownerId);
        return trip;
    }

    private List<ItineraryItem> LoadBacklog(Guid tripId, string ownerId) =>
        dbContext.ItineraryItems
            .AsNoTracking()
            .Where(x => x.TripId == tripId && x.OwnerId == ownerId && x.DayId == null && x.DeletedAt == null)
            .OrderBy(x => x.SortOrder)
            .ToList();

    public Trip Add(Trip trip)
    {
        trip.Id = trip.Id == Guid.Empty ? Guid.NewGuid() : trip.Id;
        trip.CreatedAt = DateTimeOffset.UtcNow;
        trip.UpdatedAt = trip.CreatedAt;
        trip.DeletedAt = null;

        foreach (var day in trip.Days)
        {
            day.Id = day.Id == Guid.Empty ? Guid.NewGuid() : day.Id;
            day.TripId = trip.Id;
            day.OwnerId = trip.OwnerId;
            day.CreatedAt = trip.CreatedAt;
            day.UpdatedAt = trip.CreatedAt;
            day.DeletedAt = null;

            foreach (var item in day.Items)
            {
                item.Id = item.Id == Guid.Empty ? Guid.NewGuid() : item.Id;
                item.TripId = trip.Id;
                item.DayId = day.Id;
                item.OwnerId = trip.OwnerId;
                item.CreatedAt = trip.CreatedAt;
                item.UpdatedAt = trip.CreatedAt;
                item.DeletedAt = null;
            }
        }

        dbContext.Trips.Add(trip);

        // Backlog items are [NotMapped] on Trip, so add them to the items set explicitly.
        foreach (var item in trip.UnscheduledItems)
        {
            item.Id = item.Id == Guid.Empty ? Guid.NewGuid() : item.Id;
            item.TripId = trip.Id;
            item.DayId = null;
            item.OwnerId = trip.OwnerId;
            item.CreatedAt = trip.CreatedAt;
            item.UpdatedAt = trip.CreatedAt;
            item.DeletedAt = null;
            dbContext.ItineraryItems.Add(item);
        }

        dbContext.SaveChanges();
        return trip;
    }

    public Trip? Update(Guid id, string ownerId, Trip updated)
    {
        var existing = dbContext.Trips.SingleOrDefault(x => x.Id == id && x.OwnerId == ownerId && x.DeletedAt == null);
        if (existing is null)
            return null;

        existing.Title = updated.Title;
        existing.Destination = updated.Destination;
        existing.StartDate = updated.StartDate;
        existing.EndDate = updated.EndDate;
        existing.Travelers = updated.Travelers;
        existing.CoverTheme = updated.CoverTheme;
        existing.EstimatedCost = updated.EstimatedCost;
        existing.Currency = updated.Currency;
        existing.TimeZoneId = updated.TimeZoneId;
        existing.UpdatedAt = DateTimeOffset.UtcNow;

        TripDaySync.Sync(dbContext, existing, ownerId);
        dbContext.SaveChanges();

        return GetById(id, ownerId);
    }

    public bool Delete(Guid id, string ownerId)
    {
        var trip = dbContext.Trips.SingleOrDefault(x => x.Id == id && x.OwnerId == ownerId && x.DeletedAt == null);
        if (trip is null)
            return false;

        trip.DeletedAt = DateTimeOffset.UtcNow;
        trip.UpdatedAt = DateTimeOffset.UtcNow;

        var days = dbContext.Days.Where(x => x.TripId == id && x.DeletedAt == null).ToList();
        foreach (var day in days)
        {
            day.DeletedAt = DateTimeOffset.UtcNow;
            day.UpdatedAt = DateTimeOffset.UtcNow;
        }

        // Soft-delete every item on the trip — scheduled (on a day) and backlog (DayId == null) alike.
        var items = dbContext.ItineraryItems.Where(x => x.TripId == id && x.DeletedAt == null).ToList();
        foreach (var item in items)
        {
            item.DeletedAt = DateTimeOffset.UtcNow;
            item.UpdatedAt = DateTimeOffset.UtcNow;
        }

        dbContext.SaveChanges();
        return true;
    }

    public ItineraryItem? AddItem(Guid tripId, string ownerId, Guid dayId, ItineraryItem item)
    {
        var tripExists = dbContext.Trips.Any(x => x.Id == tripId && x.OwnerId == ownerId && x.DeletedAt == null);
        if (!tripExists)
            return null;

        var day = dbContext.Days.SingleOrDefault(x => x.Id == dayId && x.TripId == tripId && x.DeletedAt == null);
        if (day is null)
            return null;

        item.Id = item.Id == Guid.Empty ? Guid.NewGuid() : item.Id;
        item.TripId = tripId;
        item.DayId = dayId;
        item.OwnerId = ownerId;
        item.SortOrder = dbContext.ItineraryItems
            .Where(x => x.DayId == dayId && x.DeletedAt == null)
            .Select(x => (int?)x.SortOrder)
            .Max() is int max ? max + 1 : 0;
        item.CreatedAt = DateTimeOffset.UtcNow;
        item.UpdatedAt = item.CreatedAt;
        item.DeletedAt = null;

        dbContext.ItineraryItems.Add(item);
        day.UpdatedAt = DateTimeOffset.UtcNow;
        dbContext.SaveChanges();
        return item;
    }

    public ItineraryItem? AddUnscheduledItem(Guid tripId, string ownerId, ItineraryItem item)
    {
        if (!TripIsOwned(tripId, ownerId))
            return null;

        item.Id = item.Id == Guid.Empty ? Guid.NewGuid() : item.Id;
        item.TripId = tripId;
        item.DayId = null;
        item.OwnerId = ownerId;
        item.Status = item.Status == ItineraryItemStatus.Confirmed ? ItineraryItemStatus.Wishlist : item.Status;
        item.SortOrder = dbContext.ItineraryItems
            .Where(x => x.TripId == tripId && x.DayId == null && x.DeletedAt == null)
            .Select(x => (int?)x.SortOrder)
            .Max() is int max ? max + 1 : 0;
        item.CreatedAt = DateTimeOffset.UtcNow;
        item.UpdatedAt = item.CreatedAt;
        item.DeletedAt = null;

        dbContext.ItineraryItems.Add(item);
        dbContext.SaveChanges();
        return item;
    }

    public ItineraryItem? UpdateItem(Guid tripId, string ownerId, Guid itemId, ItineraryItem updated)
    {
        var item = FindOwnedItem(tripId, ownerId, itemId);
        if (item is null)
            return null;

        item.Type = updated.Type;
        item.Status = updated.Status;
        item.Title = updated.Title;
        item.FlightNumber = updated.FlightNumber;
        item.LocationName = updated.LocationName;
        item.Address = updated.Address;
        item.PlaceId = updated.PlaceId;
        item.Latitude = updated.Latitude;
        item.Longitude = updated.Longitude;
        item.StartTime = updated.StartTime;
        item.EndTime = updated.EndTime;
        item.Cost = updated.Cost;
        item.Currency = updated.Currency;
        item.ConfirmationNo = updated.ConfirmationNo;
        item.BookingUrl = updated.BookingUrl;
        item.Notes = updated.Notes;
        item.UpdatedAt = DateTimeOffset.UtcNow;
        dbContext.SaveChanges();
        return item;
    }

    public ItineraryItem? SetItemStatus(Guid tripId, string ownerId, Guid itemId, ItineraryItemStatus status)
    {
        var item = FindOwnedItem(tripId, ownerId, itemId);
        if (item is null)
            return null;

        item.Status = status;
        item.UpdatedAt = DateTimeOffset.UtcNow;
        dbContext.SaveChanges();
        return item;
    }

    public bool DeleteItem(Guid tripId, string ownerId, Guid itemId)
    {
        var item = FindOwnedItem(tripId, ownerId, itemId);
        if (item is null)
            return false;

        item.DeletedAt = DateTimeOffset.UtcNow;
        item.UpdatedAt = DateTimeOffset.UtcNow;
        dbContext.SaveChanges();
        return true;
    }

    public bool ReorderDayItems(Guid tripId, string ownerId, Guid? dayId, IReadOnlyList<Guid> orderedItemIds)
    {
        if (!TripIsOwned(tripId, ownerId))
            return false;

        if (dayId is { } id)
        {
            var dayExists = dbContext.Days.Any(d =>
                d.Id == id && d.TripId == tripId && d.OwnerId == ownerId && d.DeletedAt == null);
            if (!dayExists)
                return false;
        }

        var items = dbContext.ItineraryItems
            .Where(i => i.TripId == tripId && i.DayId == dayId && i.DeletedAt == null)
            .ToList();

        var order = orderedItemIds
            .Select((id, index) => (id, index))
            .ToDictionary(x => x.id, x => x.index);

        var now = DateTimeOffset.UtcNow;
        foreach (var item in items)
        {
            if (!order.TryGetValue(item.Id, out var index))
                continue;
            item.SortOrder = index;
            item.UpdatedAt = now;
        }

        dbContext.SaveChanges();
        return true;
    }

    public ItineraryItem? MoveItem(Guid tripId, string ownerId, Guid itemId, Guid? targetDayId)
    {
        var item = FindOwnedItem(tripId, ownerId, itemId);
        if (item is null)
            return null;

        if (targetDayId is { } dayId)
        {
            var targetExists = dbContext.Days.Any(d =>
                d.Id == dayId && d.TripId == tripId && d.OwnerId == ownerId && d.DeletedAt == null);
            if (!targetExists)
                return null;
        }

        item.DayId = targetDayId;
        item.SortOrder = dbContext.ItineraryItems
            .Where(x => x.TripId == tripId && x.DayId == targetDayId && x.DeletedAt == null && x.Id != itemId)
            .Select(x => (int?)x.SortOrder)
            .Max() is int max ? max + 1 : 0;
        item.UpdatedAt = DateTimeOffset.UtcNow;
        dbContext.SaveChanges();
        return item;
    }

    public IEnumerable<PackingItem> GetPackingItems(Guid tripId, string ownerId)
    {
        if (!TripIsOwned(tripId, ownerId))
            return [];

        return dbContext.PackingItems
            .AsNoTracking()
            .Join(dbContext.Days, p => p.DayId, d => d.Id, (p, d) => new { p, d })
            .Where(x => x.d.TripId == tripId && x.d.OwnerId == ownerId && x.p.DeletedAt == null)
            .OrderBy(x => x.p.CreatedAt)
            .Select(x => x.p)
            .ToList();
    }

    public PackingItem? AddPackingItem(Guid tripId, string ownerId, string name)
    {
        var day = dbContext.Days
            .Where(d => d.TripId == tripId && d.OwnerId == ownerId && d.DeletedAt == null)
            .OrderBy(d => d.DayNumber)
            .FirstOrDefault();
        if (day is null)
            return null;

        var packingItem = new PackingItem
        {
            Id = Guid.NewGuid(),
            DayId = day.Id,
            OwnerId = ownerId,
            Name = name,
            IsPacked = false,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        dbContext.PackingItems.Add(packingItem);
        dbContext.SaveChanges();
        return packingItem;
    }

    public PackingItem? SetPackingItemPacked(Guid tripId, string ownerId, Guid packingItemId, bool isPacked)
    {
        var packingItem = FindOwnedPackingItem(tripId, ownerId, packingItemId);
        if (packingItem is null)
            return null;

        packingItem.IsPacked = isPacked;
        packingItem.UpdatedAt = DateTimeOffset.UtcNow;
        dbContext.SaveChanges();
        return packingItem;
    }

    public bool DeletePackingItem(Guid tripId, string ownerId, Guid packingItemId)
    {
        var packingItem = FindOwnedPackingItem(tripId, ownerId, packingItemId);
        if (packingItem is null)
            return false;

        packingItem.DeletedAt = DateTimeOffset.UtcNow;
        packingItem.UpdatedAt = DateTimeOffset.UtcNow;
        dbContext.SaveChanges();
        return true;
    }

    private bool TripIsOwned(Guid tripId, string ownerId) =>
        dbContext.Trips.Any(t => t.Id == tripId && t.OwnerId == ownerId && t.DeletedAt == null);

    // Ownership is enforced via the item's own TripId + OwnerId, so this also finds backlog
    // (DayId == null) items, which no longer join through a Day.
    private ItineraryItem? FindOwnedItem(Guid tripId, string ownerId, Guid itemId) =>
        dbContext.ItineraryItems.SingleOrDefault(x =>
            x.Id == itemId &&
            x.TripId == tripId &&
            x.OwnerId == ownerId &&
            x.DeletedAt == null);

    private PackingItem? FindOwnedPackingItem(Guid tripId, string ownerId, Guid packingItemId) =>
        dbContext.PackingItems
            .Join(dbContext.Days, p => p.DayId, d => d.Id, (p, d) => new { p, d })
            .Where(x =>
                x.p.Id == packingItemId &&
                x.p.DeletedAt == null &&
                x.d.TripId == tripId &&
                x.d.OwnerId == ownerId &&
                x.d.DeletedAt == null)
            .Select(x => x.p)
            .SingleOrDefault();

    private IQueryable<Trip> QueryTrips(string ownerId) =>
        dbContext.Trips
            .AsNoTracking()
            .Where(x => x.OwnerId == ownerId && x.DeletedAt == null)
            .Include(x => x.Days.Where(day => day.DeletedAt == null).OrderBy(day => day.DayNumber))
                .ThenInclude(day => day.Items.Where(item => item.DeletedAt == null).OrderBy(item => item.SortOrder))
            .Include(x => x.Days.Where(day => day.DeletedAt == null).OrderBy(day => day.DayNumber))
                .ThenInclude(day => day.PackingItems.Where(p => p.DeletedAt == null).OrderBy(p => p.CreatedAt))
            // Split into per-collection queries: avoids the cartesian explosion (and EF warning)
            // when a long trip has many days × items × packing rows (e.g. the 17-day Sicily trip).
            .AsSplitQuery();
}
