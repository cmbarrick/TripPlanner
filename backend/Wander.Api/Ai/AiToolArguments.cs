using System.Globalization;
using System.Text.Json;

namespace Wander.Api.Ai;

/// <summary>Parses and validates tool-call argument JSON before execution.</summary>
public static class AiToolArguments
{
    private static readonly HashSet<string> ForbiddenKeys =
        new(StringComparer.OrdinalIgnoreCase) { "confirmationNo", "bookingUrl", "confirmationNumber" };

    public static JsonDocument ParseObject(string argumentsJson, string toolName)
    {
        if (string.IsNullOrWhiteSpace(argumentsJson))
            throw new AiToolExecutionException($"{toolName}: arguments are required.");

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(argumentsJson);
        }
        catch (JsonException ex)
        {
            throw new AiToolExecutionException($"{toolName}: invalid JSON ({ex.Message}).");
        }

        if (doc.RootElement.ValueKind != JsonValueKind.Object)
            throw new AiToolExecutionException($"{toolName}: arguments must be a JSON object.");

        foreach (var key in ForbiddenKeys)
        {
            if (doc.RootElement.TryGetProperty(key, out _))
                throw new AiToolExecutionException($"{toolName}: {key} is not allowed.");
        }

        return doc;
    }

    public static string RequireString(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el) || el.ValueKind != JsonValueKind.String)
            throw new AiToolExecutionException($"{name} is required.");
        var value = el.GetString()?.Trim() ?? "";
        if (value.Length == 0)
            throw new AiToolExecutionException($"{name} is required.");
        return value;
    }

    public static int RequireInt(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el) || el.ValueKind != JsonValueKind.Number)
            throw new AiToolExecutionException($"{name} is required.");
        return el.GetInt32();
    }

    public static int OptionalInt(JsonElement root, string name, int defaultValue)
    {
        if (!root.TryGetProperty(name, out var el) || el.ValueKind == JsonValueKind.Null)
            return defaultValue;
        if (el.ValueKind != JsonValueKind.Number)
            throw new AiToolExecutionException($"{name} must be a number.");
        return el.GetInt32();
    }

    public static string? OptionalString(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el) || el.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return null;
        if (el.ValueKind != JsonValueKind.String)
            throw new AiToolExecutionException($"{name} must be a string.");
        var value = el.GetString()?.Trim();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    public static decimal? OptionalDecimal(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el) || el.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return null;
        if (el.ValueKind != JsonValueKind.Number)
            throw new AiToolExecutionException($"{name} must be a number.");
        return el.GetDecimal();
    }

    public static int? OptionalNullableInt(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el) || el.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return null;
        if (el.ValueKind != JsonValueKind.Number)
            throw new AiToolExecutionException($"{name} must be a number or null.");
        return el.GetInt32();
    }

    public static Guid RequireGuid(JsonElement root, string name)
    {
        var text = RequireString(root, name);
        if (!Guid.TryParse(text, out var id))
            throw new AiToolExecutionException($"{name} must be a valid UUID.");
        return id;
    }

    public static TimeOnly? OptionalTime(JsonElement root, string name)
    {
        var text = OptionalString(root, name);
        if (text is null)
            return null;
        if (TimeOnly.TryParse(text, CultureInfo.InvariantCulture, out var time))
            return time;
        throw new AiToolExecutionException($"{name} must be HH:mm.");
    }
}
