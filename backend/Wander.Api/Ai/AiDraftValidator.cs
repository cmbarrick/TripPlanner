using System.Globalization;
using System.Text.Json;
using Wander.Api.Models;

namespace Wander.Api.Ai;

/// <summary>Parses and validates model JSON into a safe ephemeral draft for the client.</summary>
public static class AiDraftValidator
{
    public const int MaxItems = 60;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public static GenerateItineraryResponse ParseAndValidate(string json, Trip trip)
    {
        if (string.IsNullOrWhiteSpace(json))
            throw new AiDraftParseException("The model returned an empty response.");

        AiItineraryDraftPayload payload;
        try
        {
            payload = JsonSerializer.Deserialize<AiItineraryDraftPayload>(json, JsonOptions)
                ?? throw new AiDraftParseException("Could not parse itinerary draft.");
        }
        catch (JsonException ex)
        {
            throw new AiDraftParseException($"Invalid itinerary JSON: {ex.Message}");
        }

        if (payload.Items.Count == 0)
            throw new AiDraftParseException("The draft contains no items.");

        if (payload.Items.Count > MaxItems)
            throw new AiDraftParseException($"The draft exceeds the maximum of {MaxItems} items.");

        var dayNumbers = trip.Days
            .OrderBy(d => d.DayNumber)
            .Select(d => d.DayNumber)
            .ToHashSet();

        if (dayNumbers.Count == 0)
            throw new AiDraftParseException("This trip has no days to plan.");

        var items = new List<DraftItineraryItemDto>(payload.Items.Count);
        foreach (var raw in payload.Items)
        {
            if (!dayNumbers.Contains(raw.DayNumber))
                throw new AiDraftParseException($"Day {raw.DayNumber} is not part of this trip.");

            if (!Enum.TryParse<ItineraryItemType>(raw.Type, ignoreCase: true, out var type))
                throw new AiDraftParseException($"Unknown item type '{raw.Type}'.");

            var title = raw.Title?.Trim() ?? "";
            if (title.Length == 0)
                throw new AiDraftParseException("Each item needs a title.");
            if (title.Length > ItineraryItem.MaxTitleLength)
                throw new AiDraftParseException($"Title '{title[..40]}…' is too long.");

            if (raw.Cost is { } cost && cost < 0)
                throw new AiDraftParseException("Item cost cannot be negative.");

            var start = NormalizeTime(raw.StartTime);
            var end = NormalizeTime(raw.EndTime);
            if (start is not null && end is not null
                && TimeOnly.Parse(start, CultureInfo.InvariantCulture) > TimeOnly.Parse(end, CultureInfo.InvariantCulture))
                throw new AiDraftParseException($"'{title}' end time must be on or after the start time.");

            items.Add(new DraftItineraryItemDto(
                raw.DayNumber,
                type.ToString(),
                title,
                start,
                end,
                NullIfBlank(raw.LocationName),
                NullIfBlank(raw.Address),
                raw.Cost,
                NullIfBlank(raw.Notes)));
        }

        var summary = string.IsNullOrWhiteSpace(payload.Summary)
            ? "Generated itinerary draft"
            : payload.Summary.Trim();

        return new GenerateItineraryResponse(summary, items, 0);
    }

    internal static string? NormalizeTime(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var trimmed = value.Trim();
        if (TimeOnly.TryParse(trimmed, CultureInfo.InvariantCulture, out var time))
            return time.ToString("HH:mm:ss", CultureInfo.InvariantCulture);

        throw new AiDraftParseException($"Invalid time '{value}'. Use HH:mm.");
    }

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
