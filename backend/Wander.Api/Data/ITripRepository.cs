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

    /// <summary>Adds an item to the trip backlog (no day). Defaults to <see cref="ItineraryItemStatus.Wishlist"/>.</summary>
    ItineraryItem? AddUnscheduledItem(Guid tripId, string ownerId, ItineraryItem item);

    ItineraryItem? UpdateItem(Guid tripId, string ownerId, Guid itemId, ItineraryItem updated);
    bool DeleteItem(Guid tripId, string ownerId, Guid itemId);

    /// <summary>Sets the lifecycle status (wishlist / tentative / confirmed) of an item.</summary>
    ItineraryItem? SetItemStatus(Guid tripId, string ownerId, Guid itemId, ItineraryItemStatus status);

    /// <summary>Sets each item's SortOrder to its position in <paramref name="orderedItemIds"/>.
    /// Pass <paramref name="dayId"/> = <c>null</c> to reorder the trip backlog.</summary>
    bool ReorderDayItems(Guid tripId, string ownerId, Guid? dayId, IReadOnlyList<Guid> orderedItemIds);

    /// <summary>Moves an item onto another day (appended), or to the backlog when
    /// <paramref name="targetDayId"/> is <c>null</c>.</summary>
    ItineraryItem? MoveItem(Guid tripId, string ownerId, Guid itemId, Guid? targetDayId);

    IEnumerable<PackingItem> GetPackingItems(Guid tripId, string ownerId);
    PackingItem? AddPackingItem(Guid tripId, string ownerId, string name);
    PackingItem? SetPackingItemPacked(Guid tripId, string ownerId, Guid packingItemId, bool isPacked);
    bool DeletePackingItem(Guid tripId, string ownerId, Guid packingItemId);
}
