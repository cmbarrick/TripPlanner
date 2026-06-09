using System.Text.RegularExpressions;

namespace Wander.Api.Ai;

/// <summary>Lightweight prompt-injection and unsafe-input checks for user-supplied AI prompts.</summary>
public static partial class AiInputGuard
{
    public const int MaxCheckedLength = 4000;

    [GeneratedRegex(
        @"(?i)(ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)|" +
        @"disregard\s+(all\s+)?(previous|prior|above)|" +
        @"forget\s+(everything|all)\s+(above|before|prior)|" +
        @"you\s+are\s+now\s+(?:a|an|the)\s+|system\s*:\s*|" +
        @"<\s*/?\s*system\s*>|" +
        @"reveal\s+(the\s+)?(system\s+)?prompt|" +
        @"jailbreak|" +
        @"do\s+anything\s+now|" +
        @"\bDAN\b)",
        RegexOptions.CultureInvariant | RegexOptions.Compiled)]
    private static partial Regex InjectionPattern();

    /// <returns>User-facing rejection message, or null when input is acceptable.</returns>
    public static string? Validate(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return null;

        var text = input.Trim();
        if (text.Length > MaxCheckedLength)
            return $"Input cannot exceed {MaxCheckedLength} characters.";

        if (InjectionPattern().IsMatch(text))
            return "That message looks like an instruction override. Rephrase your travel request.";

        return null;
    }
}
