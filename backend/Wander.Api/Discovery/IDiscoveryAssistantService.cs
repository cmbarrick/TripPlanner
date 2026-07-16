using Microsoft.EntityFrameworkCore;
using Wander.Api.Ai;
using Wander.Api.Data;

namespace Wander.Api.Discovery;

/// <summary>
/// RAG discovery assistant (Phase 8, Slice 3): retrieves relevant public recaps via
/// <see cref="ISearchService"/>, then asks the model for a grounded, cited answer — reusing the
/// same strict-grounding discipline as Phase 6 recap generation (label sources, drop invented
/// citations, refuse rather than hallucinate when nothing actually answers the question).
/// </summary>
public interface IDiscoveryAssistantService
{
    Task<DiscoveryAnswer> AskAsync(string ownerId, string question, CancellationToken ct = default);
}

public sealed class DiscoveryAssistantService(
    IAiProvider ai,
    ISearchService search,
    WanderDbContext db,
    IAiTokenQuotaService quota) : IDiscoveryAssistantService
{
    /// <summary>Cap on retrieved recaps per question — enough context without an oversized prompt.</summary>
    public const int MaxSources = 6;

    /// <summary>
    /// Minimum cosine similarity for a semantically-ranked result to count as "found" — below this,
    /// a recap is topically unrelated noise, not a source, and feeding it to the model just wastes
    /// tokens the model then has to recognize as irrelevant. A keyword-fallback match (no embedding
    /// yet — <c>Relevance == null</c>) is a literal match, so it always counts regardless of this
    /// floor. The model's own "hasAnswer: false" judgment is still the main defense against
    /// hallucination; this is a cheap pre-filter, not a substitute for it.
    /// </summary>
    public const double MinRelevance = 0.15;

    public async Task<DiscoveryAnswer> AskAsync(string ownerId, string question, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(question))
            throw new ArgumentException("A question is required.");

        if (!ai.IsEnabled)
            throw new InvalidOperationException("AI is not configured.");

        var retrieved = await search.SearchAsync(new SearchQuery(Text: question, Take: MaxSources), ct);
        var results = retrieved.Where(r => r.Relevance is null || r.Relevance >= MinRelevance).ToList();
        if (results.Count == 0)
            return new DiscoveryAnswer(DiscoveryAnswerStatus.NoSource, null, [], 0);

        var recapIds = results.Select(r => r.RecapId).Distinct().ToList();
        var bodiesById = await db.Recaps.AsNoTracking()
            .Where(r => recapIds.Contains(r.Id))
            .ToDictionaryAsync(r => r.Id, r => r.Body, ct);

        var sources = results
            .Select((r, i) => new DiscoveryPromptBuilder.LabeledSource(
                $"r{i + 1}", r.RecapId, r.Title,
                bodiesById.TryGetValue(r.RecapId, out var body) && !string.IsNullOrWhiteSpace(body) ? body : r.Snippet))
            .ToList();
        var citationsByLabel = sources.Zip(results, (s, r) =>
                (s.Label, Citation: new DiscoveryCitation(r.PublicRecapId, r.RecapId, r.TripId, r.Title, r.Places)))
            .ToDictionary(x => x.Label, x => x.Citation);

        var snapshot = await quota.GetSnapshotAsync(ownerId, ct);
        if (snapshot.RemainingToday <= 0)
            throw new AiQuotaExceededException();

        var messages = new List<AiMessage>
        {
            new(AiRole.System, DiscoveryPromptBuilder.SystemPrefix),
            new(AiRole.User, DiscoveryPromptBuilder.FormatContext(question, sources)),
        };

        var completionRequest = new AiCompletionRequest(
            messages,
            [],
            Format: AiResponseFormat.JsonSchema,
            JsonSchema: DiscoverySchema.JsonSchema,
            MaxOutputTokens: 1024,
            Temperature: 0.3,
            DeploymentKind: "discovery");

        var (json, usage) = await CollectTextAsync(ai, completionRequest, ct);

        if (!await quota.TryRecordUsageAsync(ownerId, usage, ct))
            throw new AiQuotaExceededException();

        return DiscoveryValidator.ParseAndValidate(json, citationsByLabel, usage.TotalTokens);
    }

    private static async Task<(string Text, AiUsage Usage)> CollectTextAsync(
        IAiProvider provider, AiCompletionRequest request, CancellationToken ct)
    {
        var sb = new System.Text.StringBuilder();
        var usage = new AiUsage(0, 0);
        await foreach (var delta in provider.CompleteAsync(request, ct))
        {
            if (delta is TextDelta text)
                sb.Append(text.Text);
            if (delta is CompletionDone done)
                usage = done.Usage;
        }

        return (sb.ToString(), usage);
    }
}
