using System.Globalization;
using System.Text.Json;
using Wander.Api.Activities;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Places;
using Wander.Api.Weather;

namespace Wander.Api.Ai;

public sealed record AiToolExecutionResult(
    string ResultJson,
    IReadOnlyList<AiTripChange> Changes,
    IReadOnlyList<AiUndoStep>? UndoSteps = null);

public interface IAiToolExecutor
{
    Task<AiToolExecutionResult> ExecuteAsync(
        Trip trip,
        string ownerId,
        string toolName,
        string argumentsJson,
        CancellationToken ct = default);
}

public sealed class AiToolExecutor(
    ITripRepository trips,
    IPlaceProvider places,
    IWeatherProvider weather,
    IActivityProvider activities) : IAiToolExecutor
{
    public async Task<AiToolExecutionResult> ExecuteAsync(
        Trip trip,
        string ownerId,
        string toolName,
        string argumentsJson,
        CancellationToken ct = default)
    {
        using var doc = AiToolArguments.ParseObject(argumentsJson, toolName);
        var root = doc.RootElement;

        return toolName switch
        {
            "searchPlaces" => await SearchPlacesAsync(trip, root, ct),
            "getWeather" => await GetWeatherAsync(trip, root, ct),
            "addItineraryItem" => await AddItem(trip, ownerId, root, ct),
            "moveItem" => MoveItem(trip, ownerId, root),
            "removeItem" => RemoveItem(trip, ownerId, root),
            "suggestGapFill" => SuggestGapFill(trip, root),
            "searchActivities" => await SearchActivitiesAsync(trip, root, ct),
            _ => throw new AiToolExecutionException($"Unknown tool '{toolName}'."),
        };
    }

    private async Task<AiToolExecutionResult> SearchActivitiesAsync(Trip trip, JsonElement root, CancellationToken ct)
    {
        var dayNumber = AiToolArguments.RequireInt(root, "dayNumber");
        var day = RequireDay(trip, dayNumber);
        var query = AiToolArguments.OptionalString(root, "query");
        var limit = Math.Clamp(AiToolArguments.OptionalInt(root, "limit", 5), 1, 10);

        // Bias toward what's actually scheduled on the day when something's located there yet;
        // otherwise the trip destination is still a perfectly good search hint (Viator-style
        // providers key off a place name, not raw coordinates — see ViatorActivityProvider).
        var located = day.Items.FirstOrDefault(i => i.DeletedAt is null && !string.IsNullOrWhiteSpace(i.LocationName));
        var locationHint = located?.LocationName ?? trip.Destination;

        IReadOnlyList<ActivityOption> results;
        try
        {
            results = await activities.SearchAsync(locationHint, day.Date, query, trip.Currency, limit, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw new AiToolExecutionException("Activity search is temporarily unavailable.");
        }

        var payload = results.Select(a => new
        {
            a.ActivityId,
            a.Title,
            a.Description,
            a.PriceFrom,
            a.Currency,
            a.Rating,
        }).ToList();

        return new AiToolExecutionResult(
            JsonSerializer.Serialize(new { activities = payload }),
            []);
    }

    private async Task<AiToolExecutionResult> SearchPlacesAsync(Trip trip, JsonElement root, CancellationToken ct)
    {
        var query = AiToolArguments.RequireString(root, "query");
        var limit = Math.Clamp(AiToolArguments.OptionalInt(root, "limit", 5), 1, 8);
        var (proxLat, proxLng) = TripProximity(trip);
        var options = new PlaceSearchOptions(null, proxLng, proxLat);

        IReadOnlyList<PlaceCandidate> results;
        try
        {
            results = await places.SearchAsync(query, limit, options, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw new AiToolExecutionException("Place search is temporarily unavailable.");
        }

        var payload = results.Select(p => new
        {
            p.PlaceId,
            p.Name,
            p.Address,
            p.Latitude,
            p.Longitude,
        }).ToList();

        return new AiToolExecutionResult(
            JsonSerializer.Serialize(new { places = payload }),
            []);
    }

    private async Task<AiToolExecutionResult> GetWeatherAsync(Trip trip, JsonElement root, CancellationToken ct)
    {
        var itemIdText = AiToolArguments.OptionalString(root, "itemId");
        var hasDayNumber = root.TryGetProperty("dayNumber", out var dayEl) && dayEl.ValueKind == JsonValueKind.Number;

        if (itemIdText is null && !hasDayNumber)
            throw new AiToolExecutionException("Provide dayNumber or itemId.");

        Day? day;
        ItineraryItem? item = null;
        if (itemIdText is not null)
        {
            if (!Guid.TryParse(itemIdText, out var itemId))
                throw new AiToolExecutionException("itemId must be a valid UUID.");
            item = FindItem(trip, itemId)
                ?? throw new AiToolExecutionException("Item not found on this trip.");
            day = trip.Days.First(d => d.Items.Any(i => i.Id == itemId));
        }
        else
        {
            var dayNumber = AiToolArguments.RequireInt(root, "dayNumber");
            day = RequireDay(trip, dayNumber);
            item = day.Items
                .Where(i => i.DeletedAt is null && i.Latitude is not null && i.Longitude is not null)
                .OrderBy(i => i.StartTime)
                .ThenBy(i => i.SortOrder)
                .FirstOrDefault();
            if (item is null)
                throw new AiToolExecutionException($"Day {dayNumber} has no located stops for weather lookup.");
        }

        WeatherObservation? obs;
        try
        {
            obs = await weather.GetWeatherAsync(item!.Latitude!.Value, item.Longitude!.Value, day!.Date, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw new AiToolExecutionException("Weather is temporarily unavailable.");
        }

        if (obs is null)
            throw new AiToolExecutionException("No weather data for that location and date.");

        return new AiToolExecutionResult(
            JsonSerializer.Serialize(new
            {
                itemId = item.Id,
                dayNumber = day.DayNumber,
                highC = obs.HighC,
                lowC = obs.LowC,
                weatherCode = obs.WeatherCode,
                isClimateSummary = obs.IsClimateSummary,
            }),
            []);
    }

    private async Task<AiToolExecutionResult> AddItem(Trip trip, string ownerId, JsonElement root, CancellationToken ct)
    {
        var dayNumber = AiToolArguments.RequireInt(root, "dayNumber");
        var day = RequireDay(trip, dayNumber);
        var typeText = AiToolArguments.RequireString(root, "type");
        if (!Enum.TryParse<ItineraryItemType>(typeText, ignoreCase: true, out var type))
            throw new AiToolExecutionException($"Unknown item type '{typeText}'.");

        var title = AiToolArguments.RequireString(root, "title");
        if (title.Length > ItineraryItem.MaxTitleLength)
            throw new AiToolExecutionException("Title is too long.");

        var cost = AiToolArguments.OptionalDecimal(root, "cost");
        if (cost is < 0)
            throw new AiToolExecutionException("Cost cannot be negative.");

        var start = AiToolArguments.OptionalTime(root, "startTime");
        var end = AiToolArguments.OptionalTime(root, "endTime");
        if (start is { } s && end is { } e && e < s)
            throw new AiToolExecutionException("End time must be on or after start time.");

        // The model can only ever *reference* an activity by id from a prior searchActivities
        // result — it never supplies a URL/price itself. Re-resolving here (rather than trusting
        // anything about the id beyond its existence) means a stale or hallucinated id just fails
        // loud instead of silently attaching nothing, or worse, something wrong.
        string? bookingUrl = null;
        var activityId = AiToolArguments.OptionalString(root, "activityId");
        if (!string.IsNullOrWhiteSpace(activityId))
        {
            var option = await activities.GetDetailsAsync(activityId, ct)
                ?? throw new AiToolExecutionException("That activity is no longer available — search again.");
            bookingUrl = option.BookingUrl;
            cost ??= option.PriceFrom;
        }

        var item = new ItineraryItem
        {
            Type = type,
            Status = ItineraryItemStatus.Tentative,
            Title = title,
            StartTime = start,
            EndTime = end,
            LocationName = AiToolArguments.OptionalString(root, "locationName"),
            Address = AiToolArguments.OptionalString(root, "address"),
            PlaceId = AiToolArguments.OptionalString(root, "placeId"),
            Cost = cost,
            Currency = trip.Currency,
            Notes = AiToolArguments.OptionalString(root, "notes"),
            BookingUrl = bookingUrl,
        };

        var created = trips.AddItem(trip.Id, ownerId, day.Id, item)
            ?? throw new AiToolExecutionException("Could not add item to that day.");

        var change = new AiTripChange("added", created.Id, created.Title, dayNumber, created.StartTime?.ToString("HH:mm"));
        var undo = new AiUndoStep("deleteItem", created.Id);
        return new AiToolExecutionResult(
            JsonSerializer.Serialize(new
            {
                itemId = created.Id,
                dayNumber,
                title = created.Title,
                status = created.Status.ToString(),
                bookingUrl = created.BookingUrl,
            }),
            [change],
            [undo]);
    }

    private AiToolExecutionResult MoveItem(Trip trip, string ownerId, JsonElement root)
    {
        var itemId = AiToolArguments.RequireGuid(root, "itemId");
        var targetDayNumber = AiToolArguments.OptionalNullableInt(root, "targetDayNumber");
        Guid? targetDayId = null;
        int? newDayNumber = null;

        if (targetDayNumber is not null)
        {
            var day = RequireDay(trip, targetDayNumber.Value);
            targetDayId = day.Id;
            newDayNumber = day.DayNumber;
        }

        var existing = FindItem(trip, itemId)
            ?? throw new AiToolExecutionException("Item not found on this trip.");
        var previousDayId = existing.DayId;
        var fromDay = trip.Days.FirstOrDefault(d => d.Items.Any(i => i.Id == itemId))?.DayNumber;

        var moved = trips.MoveItem(trip.Id, ownerId, itemId, targetDayId)
            ?? throw new AiToolExecutionException("Could not move that item.");

        var detail = targetDayId is null ? "to backlog" : $"to day {newDayNumber}";
        var change = new AiTripChange("moved", moved.Id, moved.Title, newDayNumber, detail);
        var undo = new AiUndoStep("moveItem", itemId, TargetDayId: previousDayId);
        return new AiToolExecutionResult(
            JsonSerializer.Serialize(new
            {
                itemId = moved.Id,
                fromDayNumber = fromDay,
                targetDayNumber = newDayNumber,
            }),
            [change],
            [undo]);
    }

    private AiToolExecutionResult RemoveItem(Trip trip, string ownerId, JsonElement root)
    {
        var itemId = AiToolArguments.RequireGuid(root, "itemId");
        var existing = FindItem(trip, itemId)
            ?? throw new AiToolExecutionException("Item not found on this trip.");
        var dayNumber = trip.Days.FirstOrDefault(d => d.Items.Any(i => i.Id == itemId))?.DayNumber;

        if (!trips.DeleteItem(trip.Id, ownerId, itemId))
            throw new AiToolExecutionException("Could not remove that item.");

        var change = new AiTripChange("removed", itemId, existing.Title, dayNumber, null);
        var undo = new AiUndoStep("restoreItem", itemId, Restore: ItineraryItemRestore.From(existing));
        return new AiToolExecutionResult(
            JsonSerializer.Serialize(new { itemId, removed = true }),
            [change],
            [undo]);
    }

    private static AiToolExecutionResult SuggestGapFill(Trip trip, JsonElement root)
    {
        var dayNumber = AiToolArguments.RequireInt(root, "dayNumber");
        var day = RequireDay(trip, dayNumber);
        var minimumMinutes = Math.Clamp(AiToolArguments.OptionalInt(root, "minimumMinutes", 90), 30, 480);
        var gaps = AiGapFill.FindGaps(day, TimeSpan.FromMinutes(minimumMinutes));

        return new AiToolExecutionResult(
            JsonSerializer.Serialize(new
            {
                dayNumber,
                minimumMinutes,
                gaps = gaps.Select(g => new
                {
                    startTime = g.Start.ToString("HH:mm", CultureInfo.InvariantCulture),
                    endTime = g.End.ToString("HH:mm", CultureInfo.InvariantCulture),
                    durationMinutes = (int)g.Duration.TotalMinutes,
                    afterItemTitle = g.AfterItemTitle,
                    nearLocation = g.NearLocation,
                }),
            }),
            []);
    }

    private static Day RequireDay(Trip trip, int dayNumber) =>
        trip.Days.FirstOrDefault(d => d.DayNumber == dayNumber && d.DeletedAt is null)
        ?? throw new AiToolExecutionException($"Day {dayNumber} is not part of this trip.");

    private static ItineraryItem? FindItem(Trip trip, Guid itemId) =>
        trip.Days.SelectMany(d => d.Items).Concat(trip.UnscheduledItems)
            .FirstOrDefault(i => i.Id == itemId && i.DeletedAt is null);

    private static (double? Lat, double? Lng) TripProximity(Trip trip)
    {
        var located = trip.Days
            .SelectMany(d => d.Items)
            .FirstOrDefault(i => i.DeletedAt is null && i.Latitude is not null && i.Longitude is not null);
        return located is null ? (null, null) : (located.Latitude, located.Longitude);
    }
}

public static class AiGapFill
{
    public sealed record GapSlot(TimeOnly Start, TimeOnly End, TimeSpan Duration, string? AfterItemTitle, string? NearLocation);

    public static IReadOnlyList<GapSlot> FindGaps(Day day, TimeSpan minimumGap)
    {
        var items = day.Items
            .Where(i => i.DeletedAt is null && i.StartTime is not null)
            .OrderBy(i => i.StartTime)
            .ThenBy(i => i.SortOrder)
            .ToList();

        if (items.Count == 0)
        {
            return
            [
                new GapSlot(new TimeOnly(9, 0), new TimeOnly(21, 0), TimeSpan.FromHours(12), null, null),
            ];
        }

        var gaps = new List<GapSlot>();
        var dayStart = new TimeOnly(8, 0);
        var dayEnd = new TimeOnly(22, 0);

        var first = items[0];
        if (first.StartTime!.Value > dayStart)
        {
            var duration = first.StartTime.Value - dayStart;
            if (duration >= minimumGap)
                gaps.Add(new GapSlot(dayStart, first.StartTime.Value, duration, null, first.LocationName));
        }

        for (var i = 0; i < items.Count - 1; i++)
        {
            var current = items[i];
            var next = items[i + 1];
            var gapStart = current.EndTime ?? current.StartTime!.Value.AddHours(1);
            var gapEnd = next.StartTime!.Value;
            if (gapEnd <= gapStart)
                continue;
            var duration = gapEnd - gapStart;
            if (duration >= minimumGap)
            {
                gaps.Add(new GapSlot(
                    gapStart,
                    gapEnd,
                    duration,
                    current.Title,
                    current.LocationName ?? next.LocationName));
            }
        }

        var last = items[^1];
        var lastEnd = last.EndTime ?? last.StartTime!.Value.AddHours(1);
        if (dayEnd > lastEnd)
        {
            var duration = dayEnd - lastEnd;
            if (duration >= minimumGap)
                gaps.Add(new GapSlot(lastEnd, dayEnd, duration, last.Title, last.LocationName));
        }

        return gaps;
    }
}
