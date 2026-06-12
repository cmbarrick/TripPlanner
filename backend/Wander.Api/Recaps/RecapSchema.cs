namespace Wander.Api.Recaps;

/// <summary>Structured output schema for recap generation (mirrors <see cref="Wander.Api.Ai.AiItineraryDraftSchema"/>).</summary>
public static class RecapSchema
{
    /// <summary>OpenAI strict JSON schema for a recap model turn. noteIds carry the n1..nN
    /// citation labels from the prompt context.</summary>
    public const string JsonSchema = """
        {
          "type": "object",
          "properties": {
            "title": { "type": "string" },
            "sections": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "heading": { "type": "string" },
                  "body": { "type": "string" },
                  "noteIds": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["heading", "body", "noteIds"],
                "additionalProperties": false
              }
            }
          },
          "required": ["title", "sections"],
          "additionalProperties": false
        }
        """;
}
