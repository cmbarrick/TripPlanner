namespace Wander.Api.Models;

/// <summary>Allowed values for server-backed travel planning preferences (Phase 5 Slice 1).</summary>
public static class TravelPreferenceValues
{
    public static readonly HashSet<string> TravelStyles =
        new(StringComparer.OrdinalIgnoreCase) { "adventure", "culture", "foodie", "relaxation", "mixed" };

    public static readonly HashSet<string> Paces =
        new(StringComparer.OrdinalIgnoreCase) { "relaxed", "moderate", "packed" };

    public static readonly HashSet<string> Diets =
        new(StringComparer.OrdinalIgnoreCase) { "none", "vegetarian", "vegan", "gluten_free", "halal", "kosher" };

    public static readonly HashSet<string> BudgetBands =
        new(StringComparer.OrdinalIgnoreCase) { "budget", "mid", "luxury" };

    public static readonly HashSet<string> TemperatureUnits =
        new(StringComparer.OrdinalIgnoreCase) { "F", "C" };

    public static readonly HashSet<string> DistanceUnits =
        new(StringComparer.OrdinalIgnoreCase) { "mi", "km" };

    public static bool IsValidOptional(string? value, HashSet<string> allowed) =>
        value is null || allowed.Contains(value);

    public static string Normalize(string value, HashSet<string> allowed)
    {
        var match = allowed.FirstOrDefault(v => v.Equals(value, StringComparison.OrdinalIgnoreCase));
        if (match is null)
            throw new ArgumentException($"Invalid value '{value}'.");
        return match;
    }
}
