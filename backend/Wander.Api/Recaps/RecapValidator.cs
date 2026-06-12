using System.Text;
using System.Text.Json;
using Wander.Api.Ai;

namespace Wander.Api.Recaps;

/// <summary>
/// Parses the model's structured recap and enforces grounding: citation labels are mapped back
/// to real note ids and any label the model invented is silently dropped, so a recap can never
/// cite a note that wasn't in its context.
/// </summary>
public static class RecapValidator
{
    public sealed record ParsedRecap(string Title, IReadOnlyList<RecapSectionDto> Sections);

    public static ParsedRecap ParseAndValidate(string json, IReadOnlyDictionary<string, Guid> noteIdsByLabel)
    {
        RecapPayload? payload;
        try
        {
            payload = JsonSerializer.Deserialize<RecapPayload>(json, AiJson.CamelCase);
        }
        catch (JsonException ex)
        {
            throw new RecapParseException($"AI returned malformed recap JSON: {ex.Message}");
        }

        if (payload is null || string.IsNullOrWhiteSpace(payload.Title))
            throw new RecapParseException("AI returned an empty recap.");

        var sections = new List<RecapSectionDto>();
        foreach (var section in payload.Sections)
        {
            if (string.IsNullOrWhiteSpace(section.Body))
                continue;

            var noteIds = (section.NoteIds ?? [])
                .Select(label => noteIdsByLabel.TryGetValue(label.Trim(), out var id) ? id : (Guid?)null)
                .Where(id => id is not null)
                .Select(id => id!.Value)
                .Distinct()
                .ToList();

            sections.Add(new RecapSectionDto(
                section.Heading?.Trim() ?? string.Empty,
                section.Body.Trim(),
                noteIds));
        }

        if (sections.Count == 0)
            throw new RecapParseException("AI returned a recap with no usable sections.");

        return new ParsedRecap(payload.Title.Trim(), sections);
    }

    /// <summary>Composes the editable markdown body from the generated sections.</summary>
    public static string ComposeBody(IReadOnlyList<RecapSectionDto> sections)
    {
        var sb = new StringBuilder();
        foreach (var section in sections)
        {
            if (!string.IsNullOrWhiteSpace(section.Heading))
                sb.AppendLine($"## {section.Heading}").AppendLine();
            sb.AppendLine(section.Body).AppendLine();
        }

        return sb.ToString().TrimEnd();
    }

    private sealed class RecapPayload
    {
        public string Title { get; set; } = string.Empty;
        public List<RecapSectionPayload> Sections { get; set; } = new();
    }

    private sealed class RecapSectionPayload
    {
        public string? Heading { get; set; }
        public string Body { get; set; } = string.Empty;
        public List<string>? NoteIds { get; set; }
    }
}
