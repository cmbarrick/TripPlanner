using System.Text;
using Wander.Api.Data;
using Wander.Api.Models;

namespace Wander.Api.Ai;

public interface IAiItineraryDraftService
{
    Task<GenerateItineraryResponse> GenerateAsync(
        string ownerId,
        Guid tripId,
        GenerateItineraryRequest request,
        CancellationToken ct = default);
}

public sealed class AiItineraryDraftService(
    IAiProvider ai,
    ITripRepository trips,
    IPreferenceService preferences,
    IAiTokenQuotaService quota) : IAiItineraryDraftService
{
    public const int MaxPromptLength = 2000;

    public async Task<GenerateItineraryResponse> GenerateAsync(
        string ownerId,
        Guid tripId,
        GenerateItineraryRequest request,
        CancellationToken ct = default)
    {
        if (!ai.IsEnabled)
            throw new InvalidOperationException("AI is not configured.");

        var prompt = request.Prompt?.Trim() ?? "";
        if (prompt.Length < 3)
            throw new ArgumentException("Prompt must be at least 3 characters.");
        if (prompt.Length > MaxPromptLength)
            throw new ArgumentException($"Prompt cannot exceed {MaxPromptLength} characters.");

        var guardError = AiInputGuard.Validate(prompt);
        if (guardError is not null)
            throw new ArgumentException(guardError);

        var trip = trips.GetById(tripId, ownerId)
            ?? throw new KeyNotFoundException("Trip not found.");

        if (trip.Days.Count == 0)
            throw new ArgumentException("This trip has no days to plan.");

        var snapshot = await quota.GetSnapshotAsync(ownerId, ct);
        if (snapshot.RemainingToday <= 0)
            throw new AiQuotaExceededException();

        var pref = await preferences.GetOrCreateAsync(ownerId, ct);
        var tripContext = AiPromptBuilder.FormatTripContext(trip);
        var prefLine = AiPromptBuilder.FormatUserPreferences(
            pref.TravelStyle, pref.Pace, pref.Diet, pref.BudgetBand);
        var extra = string.Join("\n\n", new[] { AiPromptBuilder.GenerateItineraryRules, tripContext, prefLine }
            .Where(s => !string.IsNullOrWhiteSpace(s)));

        var messages = new List<AiMessage>
        {
            AiPromptBuilder.BuildSystemMessage(extra),
            new AiMessage(AiRole.User, prompt),
        };

        var completionRequest = new AiCompletionRequest(
            messages,
            [],
            Format: AiResponseFormat.JsonSchema,
            JsonSchema: AiItineraryDraftSchema.JsonSchema,
            MaxOutputTokens: 4096,
            Temperature: 0.5,
            DeploymentKind: "draft");

        var (json, usage) = await CollectTextAsync(ai, completionRequest, ct);

        if (!await quota.TryRecordUsageAsync(ownerId, usage, ct))
            throw new AiQuotaExceededException();

        var draft = AiDraftValidator.ParseAndValidate(json, trip);
        return draft with { TokensUsed = usage.TotalTokens };
    }

    private static async Task<(string Text, AiUsage Usage)> CollectTextAsync(
        IAiProvider provider,
        AiCompletionRequest request,
        CancellationToken ct)
    {
        var sb = new StringBuilder();
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
