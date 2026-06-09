using Wander.Api.Data;
using Wander.Api.Models;

namespace Wander.Api.Ai;

public interface IAiUndoService
{
    IReadOnlyList<AiTripChange> ApplyUndo(string ownerId, Guid tripId, IReadOnlyList<AiUndoStep> steps);
}

public sealed class AiUndoService(ITripRepository trips) : IAiUndoService
{
    public const int MaxSteps = 50;

    public IReadOnlyList<AiTripChange> ApplyUndo(string ownerId, Guid tripId, IReadOnlyList<AiUndoStep> steps)
    {
        if (steps.Count == 0)
            throw new ArgumentException("At least one undo step is required.");
        if (steps.Count > MaxSteps)
            throw new ArgumentException($"Cannot undo more than {MaxSteps} steps at once.");

        var trip = trips.GetById(tripId, ownerId)
            ?? throw new KeyNotFoundException("Trip not found.");

        var changes = new List<AiTripChange>();
        foreach (var step in steps.Reverse())
        {
            switch (step.Kind)
            {
                case "deleteItem":
                    ApplyDeleteItem(trip, ownerId, tripId, step, changes);
                    break;
                case "restoreItem":
                    ApplyRestoreItem(trip, ownerId, tripId, step, changes);
                    break;
                case "moveItem":
                    ApplyMoveItem(trip, ownerId, tripId, step, changes);
                    break;
                default:
                    throw new ArgumentException($"Unknown undo step kind '{step.Kind}'.");
            }

            trip = trips.GetById(tripId, ownerId)!;
        }

        return changes;
    }

    private void ApplyDeleteItem(Trip trip, string ownerId, Guid tripId, AiUndoStep step, List<AiTripChange> changes)
    {
        if (step.ItemId is not { } itemId)
            throw new ArgumentException("deleteItem undo requires itemId.");

        var existing = FindItem(trip, itemId)
            ?? throw new ArgumentException("Item to delete was not found.");
        var dayNumber = DayNumberForItem(trip, itemId);

        if (!trips.DeleteItem(tripId, ownerId, itemId))
            throw new ArgumentException("Could not delete item.");

        changes.Add(new AiTripChange("removed", itemId, existing.Title, dayNumber));
    }

    private void ApplyRestoreItem(Trip trip, string ownerId, Guid tripId, AiUndoStep step, List<AiTripChange> changes)
    {
        if (step.Restore is not { } restore)
            throw new ArgumentException("restoreItem undo requires restore payload.");

        var item = restore.ToItem(trip.Currency);
        ItineraryItem? created;
        int? dayNumber = null;

        if (restore.DayId is { } dayId)
        {
            var day = trip.Days.FirstOrDefault(d => d.Id == dayId && d.DeletedAt is null)
                ?? throw new ArgumentException("Target day was not found.");
            dayNumber = day.DayNumber;
            created = trips.AddItem(tripId, ownerId, dayId, item)
                ?? throw new ArgumentException("Could not restore item to day.");
        }
        else
        {
            created = trips.AddUnscheduledItem(tripId, ownerId, item)
                ?? throw new ArgumentException("Could not restore item to backlog.");
        }

        var detail = created.StartTime?.ToString("HH:mm");
        changes.Add(new AiTripChange("added", created.Id, created.Title, dayNumber, detail));
    }

    private void ApplyMoveItem(Trip trip, string ownerId, Guid tripId, AiUndoStep step, List<AiTripChange> changes)
    {
        if (step.ItemId is not { } itemId)
            throw new ArgumentException("moveItem undo requires itemId.");

        var existing = FindItem(trip, itemId)
            ?? throw new ArgumentException("Item to move was not found.");

        var moved = trips.MoveItem(tripId, ownerId, itemId, step.TargetDayId)
            ?? throw new ArgumentException("Could not move item.");

        var dayNumber = step.TargetDayId is null
            ? null
            : trip.Days.FirstOrDefault(d => d.Id == step.TargetDayId)?.DayNumber;
        var detail = step.TargetDayId is null ? "to backlog" : $"to day {dayNumber}";
        changes.Add(new AiTripChange("moved", moved.Id, moved.Title, dayNumber, detail));
    }

    private static ItineraryItem? FindItem(Trip trip, Guid itemId) =>
        trip.Days.SelectMany(d => d.Items).Concat(trip.UnscheduledItems)
            .FirstOrDefault(i => i.Id == itemId && i.DeletedAt is null);

    private static int? DayNumberForItem(Trip trip, Guid itemId) =>
        trip.Days.FirstOrDefault(d => d.Items.Any(i => i.Id == itemId))?.DayNumber;
}
