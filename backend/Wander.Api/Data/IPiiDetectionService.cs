using System.Text.RegularExpressions;
using System.Text.Json.Serialization;

namespace Wander.Api.Data;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PiiType
{
    Email,
    Phone
}

public record PiiFinding(PiiType Type, string Value);

/// <summary>
/// PII detection before a recap can go public (Phase 8, Slice 1 carryover): "detect and offer to
/// redact personal data before anything goes public" (privacy-consent-moderation.md §3). Findings
/// are surfaced to the caller as a redaction review, not auto-redacted — the user edits the recap
/// or explicitly acknowledges and publishes anyway.
/// </summary>
public interface IPiiDetectionService
{
    IReadOnlyList<PiiFinding> Detect(string text);
}

/// <summary>
/// Regex-based detector for the two PII categories that are reliably pattern-matchable without an
/// NLP model: emails and phone numbers. Names/addresses/license plates/faces (the rest of the
/// privacy doc's list) need a real entity-recognition provider (e.g. Azure AI Language PII
/// detection) and are out of scope until that seam is added — this is a real, always-on detector,
/// not a fake standing in for one (unlike moderation, regex genuinely catches these two patterns).
/// </summary>
public class RegexPiiDetectionService : IPiiDetectionService
{
    private static readonly Regex EmailPattern = new(
        @"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
        RegexOptions.Compiled);

    // Loosely matches common US/international formats: (555) 123-4567, 555-123-4567,
    // +1 555 123 4567, 555.123.4567 — deliberately permissive since a false positive just adds a
    // finding to review, while a false negative silently ships PII.
    private static readonly Regex PhonePattern = new(
        @"(?<!\d)(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)",
        RegexOptions.Compiled);

    public IReadOnlyList<PiiFinding> Detect(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return [];

        var findings = new List<PiiFinding>();
        foreach (Match match in EmailPattern.Matches(text))
            findings.Add(new PiiFinding(PiiType.Email, match.Value));
        foreach (Match match in PhonePattern.Matches(text))
            findings.Add(new PiiFinding(PiiType.Phone, match.Value.Trim()));
        return findings;
    }
}
