using Azure.AI.ContentSafety;
using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>
/// Real content-safety review via Azure AI Content Safety, swapped in behind
/// <see cref="IContentModerationService"/> in place of <see cref="FakeContentModerationService"/>
/// when <c>Moderation:Endpoint</c>/<c>Moderation:ApiKey</c> are configured (Phase 8, Slice 1).
/// Analyzes title + body across all four harm categories; any category at or above
/// <see cref="RejectSeverityThreshold"/> rejects the recap.
/// </summary>
public class AzureContentModerationService(ContentSafetyClient client) : IContentModerationService
{
    /// <summary>Azure severity is 0/2/4/6 per category; 4+ ("Medium"+) rejects.</summary>
    public const int RejectSeverityThreshold = 4;

    public async Task<ModerationResult> ReviewAsync(string title, string body, CancellationToken ct = default)
    {
        var text = string.IsNullOrWhiteSpace(title) ? body : $"{title}\n\n{body}";
        if (string.IsNullOrWhiteSpace(text))
            return new ModerationResult(ModerationStatus.Approved, null);

        var response = await client.AnalyzeTextAsync(new AnalyzeTextOptions(text), ct);

        var worst = response.Value.CategoriesAnalysis
            .Where(a => a.Severity is not null)
            .OrderByDescending(a => a.Severity)
            .FirstOrDefault();

        if (worst is null || worst.Severity < RejectSeverityThreshold)
            return new ModerationResult(ModerationStatus.Approved, null);

        return new ModerationResult(
            ModerationStatus.Rejected,
            $"Flagged by content safety review ({worst.Category}, severity {worst.Severity}).");
    }
}
