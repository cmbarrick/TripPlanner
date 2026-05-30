using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>
/// Data-access abstraction for trips. Implemented today by an in-memory seeded
/// store; swappable for an EF Core / PostgreSQL implementation with no controller changes.
/// </summary>
public interface ITripRepository
{
    IEnumerable<Trip> GetAll(string ownerId);
    Trip? GetById(Guid id, string ownerId);
    Trip Add(Trip trip);
    Trip? Update(Guid id, string ownerId, Trip updated);
    bool Delete(Guid id, string ownerId);

    ItineraryItem? AddItem(Guid tripId, string ownerId, Guid dayId, ItineraryItem item);
    ItineraryItem? UpdateItem(Guid tripId, string ownerId, Guid itemId, ItineraryItem updated);
    bool DeleteItem(Guid tripId, string ownerId, Guid itemId);

    /// <summary>Sets each item's SortOrder to its position in <paramref name="orderedItemIds"/>.</summary>
    bool ReorderDayItems(Guid tripId, string ownerId, Guid dayId, IReadOnlyList<Guid> orderedItemIds);

    /// <summary>Moves an item to another day in the same trip, appended to the end of that day.</summary>
    ItineraryItem? MoveItem(Guid tripId, string ownerId, Guid itemId, Guid targetDayId);

    IEnumerable<PackingItem> GetPackingItems(Guid tripId, string ownerId);
    PackingItem? AddPackingItem(Guid tripId, string ownerId, string name);
    PackingItem? SetPackingItemPacked(Guid tripId, string ownerId, Guid packingItemId, bool isPacked);
    bool DeletePackingItem(Guid tripId, string ownerId, Guid packingItemId);
}
