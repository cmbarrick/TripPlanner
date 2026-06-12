using System.Text.Json;
using Wander.Api.Ai;
using Wander.Api.Models;

namespace Wander.Api.Recaps;

public static class RecapMapper
{
    /// <summary>Relative URL of the unlisted share page for a token.</summary>
    public static string ShareUrl(string shareToken) => $"/share/recaps/{shareToken}";

    public static RecapDto ToDto(Recap recap) => new(
        recap.Id,
        recap.TripId,
        recap.Scope,
        recap.TargetId,
        recap.Tone,
        recap.Title,
        recap.Body,
        ParseSections(recap.SectionsJson),
        recap.GeneratedFromNoteIds,
        recap.Status,
        recap.Version,
        recap.ShareToken is null ? null : ShareUrl(recap.ShareToken),
        recap.ExportUrls,
        recap.TokensUsed,
        recap.CreatedAt,
        recap.UpdatedAt);

    public static IReadOnlyList<RecapSectionDto> ParseSections(string? sectionsJson)
    {
        if (string.IsNullOrWhiteSpace(sectionsJson))
            return [];

        try
        {
            return JsonSerializer.Deserialize<List<RecapSectionDto>>(sectionsJson, AiJson.CamelCase) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }
}
