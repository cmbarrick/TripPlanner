using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

public class EfCoreTripRepository(WanderDbContext dbContext) : ITripRepository
{
    public IEnumerable<Trip> GetAll(string ownerId) =>
        QueryTrips(ownerId)
            .OrderBy(x => x.StartDate)
            .ToList();

    public Trip? GetById(Guid id, string ownerId) =>
        QueryTrips(ownerId).SingleOrDefault(x => x.Id == id);

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
                item.DayId = day.Id;
                item.OwnerId = trip.OwnerId;
                item.CreatedAt = trip.CreatedAt;
                item.UpdatedAt = trip.CreatedAt;
                item.DeletedAt = null;
            }
        }

        dbContext.Trips.Add(trip);
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

        var dayIds = days.Select(x => x.Id).ToList();
        var items = dbContext.ItineraryItems.Where(x => dayIds.Contains(x.DayId) && x.DeletedAt == null).ToList();
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

    public ItineraryItem? UpdateItem(Guid tripId, string ownerId, Guid itemId, ItineraryItem updated)
    {
        var item = FindOwnedItem(tripId, ownerId, itemId);
        if (item is null)
            return null;

        item.Type = updated.Type;
        item.Title = updated.Title;
        item.LocationName = updated.LocationName;
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

    public bool ReorderDayItems(Guid tripId, string ownerId, Guid dayId, IReadOnlyList<Guid> orderedItemIds)
    {
        var day = dbContext.Days.SingleOrDefault(d =>
            d.Id == dayId && d.TripId == tripId && d.OwnerId == ownerId && d.DeletedAt == null);
        if (day is null)
            return false;

        var items = dbContext.ItineraryItems
            .Where(i => i.DayId == dayId && i.DeletedAt == null)
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

    public ItineraryItem? MoveItem(Guid tripId, string ownerId, Guid itemId, Guid targetDayId)
    {
        var item = FindOwnedItem(tripId, ownerId, itemId);
        if (item is null)
            return null;

        var targetDay = dbContext.Days.SingleOrDefault(d =>
            d.Id == targetDayId && d.TripId == tripId && d.OwnerId == ownerId && d.DeletedAt == null);
        if (targetDay is null)
            return null;

        item.DayId = targetDayId;
        item.SortOrder = dbContext.ItineraryItems
            .Where(x => x.DayId == targetDayId && x.DeletedAt == null && x.Id != itemId)
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

    private ItineraryItem? FindOwnedItem(Guid tripId, string ownerId, Guid itemId) =>
        dbContext.ItineraryItems
            .Join(dbContext.Days, item => item.DayId, day => day.Id, (item, day) => new { item, day })
            .Where(x =>
                x.item.Id == itemId &&
                x.item.DeletedAt == null &&
                x.day.TripId == tripId &&
                x.day.OwnerId == ownerId &&
                x.day.DeletedAt == null)
            .Select(x => x.item)
            .SingleOrDefault();

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
