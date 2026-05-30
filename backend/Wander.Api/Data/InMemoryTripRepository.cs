using System.Collections.Concurrent;
using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>
/// Thread-safe in-memory store seeded with realistic fake trips so the whole app
/// runs locally without a database. Replace with an EF Core repository later.
/// </summary>
public class InMemoryTripRepository : ITripRepository
{
    private readonly ConcurrentDictionary<Guid, Trip> _trips = new();

    public InMemoryTripRepository()
    {
        foreach (var trip in SeedData.CreateTrips())
        {
            // Stamp the durable trip link onto seed items so payloads match the EF Core path.
            foreach (var item in trip.Days.SelectMany(d => d.Items))
                item.TripId = trip.Id;
            foreach (var item in trip.UnscheduledItems)
            {
                item.TripId = trip.Id;
                item.DayId = null;
            }
            _trips[trip.Id] = trip;
        }
    }

    public IEnumerable<Trip> GetAll(string ownerId) =>
        _trips.Values
            .Where(t => t.OwnerId == ownerId && t.DeletedAt is null)
            .OrderBy(t => t.StartDate);

    public Trip? GetById(Guid id, string ownerId) =>
        _trips.TryGetValue(id, out var trip) && trip.OwnerId == ownerId && trip.DeletedAt is null
            ? trip
            : null;

    public Trip Add(Trip trip)
    {
        trip.Id = trip.Id == Guid.Empty ? Guid.NewGuid() : trip.Id;
        trip.CreatedAt = trip.UpdatedAt = DateTimeOffset.UtcNow;
        _trips[trip.Id] = trip;
        return trip;
    }

    public Trip? Update(Guid id, string ownerId, Trip updated)
    {
        if (!_trips.TryGetValue(id, out var existing) || existing.OwnerId != ownerId || existing.DeletedAt is not null)
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
        return existing;
    }

    public bool Delete(Guid id, string ownerId)
    {
        if (!_trips.TryGetValue(id, out var trip) || trip.OwnerId != ownerId || trip.DeletedAt is not null)
            return false;

        trip.DeletedAt = DateTimeOffset.UtcNow;
        trip.UpdatedAt = DateTimeOffset.UtcNow;
        return true;
    }

    public ItineraryItem? AddItem(Guid tripId, string ownerId, Guid dayId, ItineraryItem item)
    {
        if (!_trips.TryGetValue(tripId, out var trip) || trip.OwnerId != ownerId || trip.DeletedAt is not null)
            return null;
        var day = trip.Days.FirstOrDefault(d => d.Id == dayId);
        if (day is null) return null;

        item.Id = item.Id == Guid.Empty ? Guid.NewGuid() : item.Id;
        item.TripId = tripId;
        item.DayId = dayId;
        item.OwnerId = ownerId;
        item.SortOrder = day.Items.Count == 0 ? 0 : day.Items.Max(i => i.SortOrder) + 1;
        day.Items.Add(item);
        trip.UpdatedAt = DateTimeOffset.UtcNow;
        return item;
    }

    public ItineraryItem? AddUnscheduledItem(Guid tripId, string ownerId, ItineraryItem item)
    {
        if (!_trips.TryGetValue(tripId, out var trip) || trip.OwnerId != ownerId || trip.DeletedAt is not null)
            return null;

        item.Id = item.Id == Guid.Empty ? Guid.NewGuid() : item.Id;
        item.TripId = tripId;
        item.DayId = null;
        item.OwnerId = ownerId;
        item.Status = item.Status == ItineraryItemStatus.Confirmed ? ItineraryItemStatus.Wishlist : item.Status;
        item.SortOrder = trip.UnscheduledItems.Count == 0 ? 0 : trip.UnscheduledItems.Max(i => i.SortOrder) + 1;
        trip.UnscheduledItems.Add(item);
        trip.UpdatedAt = DateTimeOffset.UtcNow;
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
        return item;
    }

    public ItineraryItem? SetItemStatus(Guid tripId, string ownerId, Guid itemId, ItineraryItemStatus status)
    {
        var item = FindOwnedItem(tripId, ownerId, itemId);
        if (item is null)
            return null;

        item.Status = status;
        item.UpdatedAt = DateTimeOffset.UtcNow;
        return item;
    }

    public bool DeleteItem(Guid tripId, string ownerId, Guid itemId)
    {
        if (!_trips.TryGetValue(tripId, out var trip) || trip.OwnerId != ownerId || trip.DeletedAt is not null)
            return false;

        var item = AllItems(trip).FirstOrDefault(i => i.Id == itemId && i.DeletedAt is null);
        if (item is null)
            return false;

        item.DeletedAt = DateTimeOffset.UtcNow;
        trip.UpdatedAt = DateTimeOffset.UtcNow;
        return true;
    }

    public bool ReorderDayItems(Guid tripId, string ownerId, Guid? dayId, IReadOnlyList<Guid> orderedItemIds)
    {
        if (!_trips.TryGetValue(tripId, out var trip) || trip.OwnerId != ownerId || trip.DeletedAt is not null)
            return false;

        List<ItineraryItem> bucket;
        if (dayId is { } id)
        {
            var day = trip.Days.FirstOrDefault(d => d.Id == id && d.DeletedAt is null);
            if (day is null)
                return false;
            bucket = day.Items;
        }
        else
        {
            bucket = trip.UnscheduledItems;
        }

        for (var i = 0; i < orderedItemIds.Count; i++)
        {
            var item = bucket.FirstOrDefault(x => x.Id == orderedItemIds[i] && x.DeletedAt is null);
            if (item is not null)
            {
                item.SortOrder = i;
                item.UpdatedAt = DateTimeOffset.UtcNow;
            }
        }
        trip.UpdatedAt = DateTimeOffset.UtcNow;
        return true;
    }

    public ItineraryItem? MoveItem(Guid tripId, string ownerId, Guid itemId, Guid? targetDayId)
    {
        if (!_trips.TryGetValue(tripId, out var trip) || trip.OwnerId != ownerId || trip.DeletedAt is not null)
            return null;

        Day? targetDay = null;
        if (targetDayId is { } dayId)
        {
            targetDay = trip.Days.FirstOrDefault(d => d.Id == dayId && d.DeletedAt is null);
            if (targetDay is null)
                return null;
        }

        // Detach from its current bucket (a day, or the backlog).
        ItineraryItem? item = null;
        foreach (var day in trip.Days)
        {
            var found = day.Items.FirstOrDefault(i => i.Id == itemId && i.DeletedAt is null);
            if (found is not null) { item = found; day.Items.Remove(found); break; }
        }
        if (item is null)
        {
            item = trip.UnscheduledItems.FirstOrDefault(i => i.Id == itemId && i.DeletedAt is null);
            if (item is not null) trip.UnscheduledItems.Remove(item);
        }
        if (item is null)
            return null;

        if (targetDay is null)
        {
            item.DayId = null;
            item.SortOrder = trip.UnscheduledItems.Count == 0 ? 0 : trip.UnscheduledItems.Max(i => i.SortOrder) + 1;
            trip.UnscheduledItems.Add(item);
        }
        else
        {
            item.DayId = targetDay.Id;
            item.SortOrder = targetDay.Items.Count == 0 ? 0 : targetDay.Items.Max(i => i.SortOrder) + 1;
            targetDay.Items.Add(item);
        }
        item.UpdatedAt = DateTimeOffset.UtcNow;
        trip.UpdatedAt = DateTimeOffset.UtcNow;
        return item;
    }

    public IEnumerable<PackingItem> GetPackingItems(Guid tripId, string ownerId)
    {
        if (!_trips.TryGetValue(tripId, out var trip) || trip.OwnerId != ownerId || trip.DeletedAt is not null)
            return [];
        return trip.Days
            .SelectMany(d => d.PackingItems)
            .Where(p => p.DeletedAt is null)
            .OrderBy(p => p.CreatedAt)
            .ToList();
    }

    public PackingItem? AddPackingItem(Guid tripId, string ownerId, string name)
    {
        if (!_trips.TryGetValue(tripId, out var trip) || trip.OwnerId != ownerId || trip.DeletedAt is not null)
            return null;
        var day = trip.Days.Where(d => d.DeletedAt is null).OrderBy(d => d.DayNumber).FirstOrDefault();
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
        day.PackingItems.Add(packingItem);
        return packingItem;
    }

    public PackingItem? SetPackingItemPacked(Guid tripId, string ownerId, Guid packingItemId, bool isPacked)
    {
        var packingItem = FindOwnedPackingItem(tripId, ownerId, packingItemId);
        if (packingItem is null)
            return null;
        packingItem.IsPacked = isPacked;
        packingItem.UpdatedAt = DateTimeOffset.UtcNow;
        return packingItem;
    }

    public bool DeletePackingItem(Guid tripId, string ownerId, Guid packingItemId)
    {
        var packingItem = FindOwnedPackingItem(tripId, ownerId, packingItemId);
        if (packingItem is null)
            return false;
        packingItem.DeletedAt = DateTimeOffset.UtcNow;
        packingItem.UpdatedAt = DateTimeOffset.UtcNow;
        return true;
    }

    private ItineraryItem? FindOwnedItem(Guid tripId, string ownerId, Guid itemId)
    {
        if (!_trips.TryGetValue(tripId, out var trip) || trip.OwnerId != ownerId || trip.DeletedAt is not null)
            return null;
        return AllItems(trip).FirstOrDefault(i => i.Id == itemId && i.DeletedAt is null);
    }

    // Scheduled items (across days) plus the trip backlog.
    private static IEnumerable<ItineraryItem> AllItems(Trip trip) =>
        trip.Days.SelectMany(d => d.Items).Concat(trip.UnscheduledItems);

    private PackingItem? FindOwnedPackingItem(Guid tripId, string ownerId, Guid packingItemId)
    {
        if (!_trips.TryGetValue(tripId, out var trip) || trip.OwnerId != ownerId || trip.DeletedAt is not null)
            return null;
        return trip.Days
            .SelectMany(d => d.PackingItems)
            .FirstOrDefault(p => p.Id == packingItemId && p.DeletedAt is null);
    }
}
