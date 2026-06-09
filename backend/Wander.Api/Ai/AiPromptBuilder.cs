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
