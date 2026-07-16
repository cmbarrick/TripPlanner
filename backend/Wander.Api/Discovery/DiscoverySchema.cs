namespace Wander.Api.Discovery;

/// <summary>Structured output schema for the discovery assistant (mirrors <see cref="Wander.Api.Recaps.RecapSchema"/>).</summary>
public static class DiscoverySchema
{
    public const string JsonSchema = """
        {
          "type": "object",
          "properties": {
            "hasAnswer": { "type": "boolean" },
            "answer": { "type": "string" },
            "sourceLabels": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["hasAnswer", "answer", "sourceLabels"],
          "additionalProperties": false
        }
        """;
}
