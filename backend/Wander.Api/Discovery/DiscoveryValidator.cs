using System.Text.Json;
using Wander.Api.Ai;

namespace Wander.Api.Discovery;

/// <summary>
/// Parses the model's structured answer and enforces grounding: <c>hasAnswer: false</c> (or
/// malformed/empty output) maps to <see cref="DiscoveryAnswerStatus.NoSource"/>, and citation
/// labels are mapped back to real retrieved recaps — any label the model invented is silently
/// dropped, mirroring <see cref="Wander.Api.Recaps.RecapValidator"/>.
/// </summary>
public static class DiscoveryValidator
{
    public static DiscoveryAnswer ParseAndValidate(
        string json,
        IReadOnlyDictionary<string, DiscoveryCitation> citationsByLabel,
        int tokensUsed)
    {
        DiscoveryPayload? payload;
        try
        {
            payload = JsonSerializer.Deserialize<DiscoveryPayload>(json, AiJson.CamelCase);
        }
        catch (JsonException ex)
        {
            throw new DiscoveryParseException($"AI returned malformed discovery JSON: {ex.Message}");
        }

        if (payload is null)
            throw new DiscoveryParseException("AI returned an empty discovery response.");

        if (!payload.HasAnswer || string.IsNullOrWhiteSpace(payload.Answer))
            return new DiscoveryAnswer(DiscoveryAnswerStatus.NoSource, null, [], tokensUsed);

        var citations = (payload.SourceLabels ?? [])
            .Select(label => citationsByLabel.GetValueOrDefault(label.Trim()))
            .Where(c => c is not null)
            .Select(c => c!)
            .DistinctBy(c => c.PublicRecapId)
            .ToList();

        return new DiscoveryAnswer(DiscoveryAnswerStatus.Answered, payload.Answer.Trim(), citations, tokensUsed);
    }

    private sealed class DiscoveryPayload
    {
        public bool HasAnswer { get; set; }
        public string? Answer { get; set; }
        public List<string>? SourceLabels { get; set; }
    }
}
