namespace Wander.Api.Ai;

/// <summary>Structured output schema for ephemeral itinerary drafts (Slice 2).</summary>
public static class AiItineraryDraftSchema
{
    /// <summary>OpenAI strict JSON schema for a generate-itinerary model turn.</summary>
    public const string JsonSchema = """
        {
          "type": "object",
          "properties": {
            "summary": { "type": "string" },
            "items": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "dayNumber": { "type": "integer" },
                  "type": { "type": "string", "enum": ["Flight", "Lodging", "Food", "Activity", "Transport"] },
                  "title": { "type": "string" },
                  "startTime": { "type": ["string", "null"] },
                  "endTime": { "type": ["string", "null"] },
                  "locationName": { "type": ["string", "null"] },
                  "address": { "type": ["string", "null"] },
                  "cost": { "type": ["number", "null"] },
                  "notes": { "type": ["string", "null"] }
                },
                "required": [
                  "dayNumber",
                  "type",
                  "title",
                  "startTime",
                  "endTime",
                  "locationName",
                  "address",
                  "cost",
                  "notes"
                ],
                "additionalProperties": false
              }
            }
          },
          "required": ["summary", "items"],
          "additionalProperties": false
        }
        """;
}

public sealed record GenerateItineraryRequest(string Prompt);

public sealed record DraftItineraryItemDto(
    int DayNumber,
    string Type,
    string Title,
    string? StartTime,
    string? EndTime,
    string? LocationName,
    string? Address,
    decimal? Cost,
    string? Notes);

public sealed record GenerateItineraryResponse(
    string Summary,
    IReadOnlyList<DraftItineraryItemDto> Items,
    int TokensUsed);

internal sealed class AiItineraryDraftPayload
{
    public string Summary { get; set; } = string.Empty;
    public List<AiItineraryDraftItemPayload> Items { get; set; } = new();
}

internal sealed class AiItineraryDraftItemPayload
{
    public int DayNumber { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? StartTime { get; set; }
    public string? EndTime { get; set; }
    public string? LocationName { get; set; }
    public string? Address { get; set; }
    public decimal? Cost { get; set; }
    public string? Notes { get; set; }
}

public sealed class AiQuotaExceededException : Exception
{
    public AiQuotaExceededException() : base("Daily AI token quota exceeded.") { }
}

public sealed class AiDraftParseException : Exception
{
    public AiDraftParseException(string message) : base(message) { }
}
