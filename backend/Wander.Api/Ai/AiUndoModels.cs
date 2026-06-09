using System.Globalization;
using Wander.Api.Models;

namespace Wander.Api.Ai;

/// <summary>Snapshot of an itinerary item used to undo a removal.</summary>
public sealed record ItineraryItemRestore(
    Guid? DayId,
    string Type,
    string Status,
    string Title,
    string? FlightNumber,
    string? LocationName,
    string? Address,
    string? PlaceId,
    double? Latitude,
    double? Longitude,
    string? StartTime,
    string? EndTime,
    decimal? Cost,
    string Currency,
    string? Notes)
{
    public static ItineraryItemRestore From(ItineraryItem item) => new(
        item.DayId,
        item.Type.ToString(),
        item.Status.ToString(),
        item.Title,
        item.FlightNumber,
        item.LocationName,
        item.Address,
        item.PlaceId,
        item.Latitude,
        item.Longitude,
        item.StartTime?.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
        item.EndTime?.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
        item.Cost,
        item.Currency,
        item.Notes);

    public ItineraryItem ToItem(string fallbackCurrency)
    {
        if (!Enum.TryParse<ItineraryItemType>(Type, ignoreCase: true, out var type))
            type = ItineraryItemType.Activity;
        if (!Enum.TryParse<ItineraryItemStatus>(Status, ignoreCase: true, out var status))
            status = ItineraryItemStatus.Tentative;

        return new ItineraryItem
        {
            Type = type,
            Status = status,
            Title = Title,
            FlightNumber = FlightNumber,
            LocationName = LocationName,
            Address = Address,
            PlaceId = PlaceId,
            Latitude = Latitude,
            Longitude = Longitude,
            StartTime = ParseOptionalTime(StartTime),
            EndTime = ParseOptionalTime(EndTime),
            Cost = Cost,
            Currency = string.IsNullOrWhiteSpace(Currency) ? fallbackCurrency : Currency,
            Notes = Notes,
        };
    }

    private static TimeOnly? ParseOptionalTime(string? text) =>
        string.IsNullOrWhiteSpace(text) ? null : TimeOnly.Parse(text, CultureInfo.InvariantCulture);
}

/// <summary>Single inverse operation for an AI batch. Applied in reverse order.</summary>
public sealed record AiUndoStep(
    string Kind,
    Guid? ItemId = null,
    Guid? TargetDayId = null,
    ItineraryItemRestore? Restore = null);

public sealed record UndoAiBatchRequest(IReadOnlyList<AiUndoStep> Steps);

public sealed record UndoAiBatchResponse(IReadOnlyList<AiTripChange> Changes);
