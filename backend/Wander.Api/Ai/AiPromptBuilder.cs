namespace Wander.Api.Ai;

/// <summary>
/// Builds cache-friendly prompts: stable system prefix first, variable trip/user content last.
/// Pure logic — unit-tested without calling the model.
/// </summary>
public static class AiPromptBuilder
{
    /// <summary>Stable guardrails and formatting rules (identical across requests for prompt caching).</summary>
    public const string SystemPrefix = """
        You are Wander, a travel planning assistant. You edit real trip itineraries via tools — never invent bookings or confirmation numbers.
        Respect user preferences (diet, pace, budget). Keep geography sensible and pacing realistic.
        When unsure, ask a clarifying question instead of guessing.
        """;

    public const string GenerateItineraryRules = """
        Task: propose a full itinerary draft as JSON matching the schema.
        Use only dayNumber values that exist on the trip. Respect user preferences and realistic pacing.
        Do not invent confirmation numbers or booking URLs. Prefer activities and meals over fabricated bookings.
        Spread items across days with sensible local start times (HH:mm). Keep titles concise.
        """;

    public const string ChatAssistantRules = """
        Task: help the traveler edit their real trip via tools. Call tools to search places, check weather,
        add/move/remove items, or analyze schedule gaps. After tool results, explain briefly what changed.
        Never invent confirmation numbers or booking URLs. New items should use Tentative status (the server sets this).
        Respect user preferences and keep geography and pacing realistic.
        """;

    public static string FormatTripContext(Models.Trip trip)
    {
        var lines = new List<string>
        {
            $"Trip: {trip.Title} — {trip.Destination}",
            $"Dates: {trip.StartDate:yyyy-MM-dd} to {trip.EndDate:yyyy-MM-dd} ({trip.Days.Count} days)",
            $"Currency: {trip.Currency}",
        };

        foreach (var day in trip.Days.OrderBy(d => d.DayNumber))
        {
            var titles = day.Items
                .Where(i => i.DeletedAt == null)
                .OrderBy(i => i.SortOrder)
                .Select(i => i.Title)
                .ToList();
            lines.Add(FormatDaySummary(day.DayNumber, day.Date, titles));
        }

        return string.Join("\n", lines);
    }

    public static AiMessage BuildSystemMessage(string? extraContext = null)
    {
        var content = string.IsNullOrWhiteSpace(extraContext)
            ? SystemPrefix
            : $"{SystemPrefix}\n\n{extraContext.Trim()}";
        return new AiMessage(AiRole.System, content);
    }

    /// <summary>Compact one-line summary per day for the variable tail of the prompt.</summary>
    public static string FormatDaySummary(int dayNumber, DateOnly date, IReadOnlyList<string> itemTitles)
    {
        var stops = itemTitles.Count == 0
            ? "empty"
            : string.Join("; ", itemTitles);
        return $"Day {dayNumber} ({date:yyyy-MM-dd}): {stops}";
    }

    /// <summary>Compact preference line for the variable tail of AI prompts.</summary>
    public static string? FormatUserPreferences(
        string? travelStyle,
        string? pace,
        string? diet,
        string? budgetBand)
    {
        var parts = new List<string>(4);
        if (!string.IsNullOrWhiteSpace(travelStyle))
            parts.Add($"travel style: {travelStyle}");
        if (!string.IsNullOrWhiteSpace(pace))
            parts.Add($"pace: {pace}");
        if (!string.IsNullOrWhiteSpace(diet) && !diet.Equals("none", StringComparison.OrdinalIgnoreCase))
            parts.Add($"diet: {diet}");
        if (!string.IsNullOrWhiteSpace(budgetBand))
            parts.Add($"budget: {budgetBand}");

        return parts.Count == 0 ? null : "User preferences: " + string.Join("; ", parts);
    }
}
