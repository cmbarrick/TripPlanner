using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Wander.Api.Data;
using Wander.Api.Models;

namespace Wander.Api.Ai;

public interface IAiPlanningService
{
    IAsyncEnumerable<AiChatStreamEvent> StreamChatAsync(
        string ownerId,
        Guid tripId,
        AiChatRequest request,
        CancellationToken ct = default);
}

public sealed class AiPlanningService(
    IAiProvider ai,
    ITripRepository trips,
    IPreferenceService preferences,
    IAiTokenQuotaService quota,
    IAiToolExecutor tools,
    IAiChatRateLimiter rateLimiter,
    IConfiguration config) : IAiPlanningService
{
    public const int MaxMessageLength = 2000;
    public const int MaxHistoryMessages = 20;
    public const int MaxToolRounds = 8;

    public async IAsyncEnumerable<AiChatStreamEvent> StreamChatAsync(
        string ownerId,
        Guid tripId,
        AiChatRequest request,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        if (!ai.IsEnabled)
        {
            yield return Error("AI is not configured.");
            yield break;
        }

        var message = request.Message?.Trim() ?? "";
        if (message.Length < 1)
        {
            yield return Error("Message is required.");
            yield break;
        }

        if (message.Length > MaxMessageLength)
        {
            yield return Error($"Message cannot exceed {MaxMessageLength} characters.");
            yield break;
        }

        var guardError = AiInputGuard.Validate(message);
        if (guardError is not null)
        {
            yield return Error(guardError);
            yield break;
        }

        if (!rateLimiter.TryAcquire(ownerId))
        {
            yield return Error("Too many chat requests. Please wait a moment and try again.");
            yield break;
        }

        var trip = trips.GetById(tripId, ownerId);
        if (trip is null)
        {
            yield return Error("Trip not found.");
            yield break;
        }

        var snapshot = await quota.GetSnapshotAsync(ownerId, ct);
        if (snapshot.RemainingToday <= 0)
        {
            yield return Error("Daily AI token quota exceeded.");
            yield break;
        }

        var pref = await preferences.GetOrCreateAsync(ownerId, ct);

        var messages = BuildMessages(trip, pref, request, message);
        var totalUsage = new AiUsage(0, 0);
        var allChanges = new List<AiTripChange>();
        var allUndoSteps = new List<AiUndoStep>();
        var batchId = Guid.NewGuid();
        var toolSchemas = AiToolSchemas.All(activitiesEnabled: config.GetValue<bool>("Activities:Enabled"));

        for (var round = 0; round < MaxToolRounds; round++)
        {
            ct.ThrowIfCancellationRequested();

            var completionRequest = new AiCompletionRequest(
                messages,
                toolSchemas,
                DeploymentKind: "chat");

            var roundText = new StringBuilder();
            var toolCalls = new List<AiToolCall>();
            AiUsage roundUsage = new(0, 0);
            AiFinishReason finish = AiFinishReason.Stop;

            await foreach (var delta in ai.CompleteAsync(completionRequest, ct))
            {
                if (delta is TextDelta text)
                {
                    roundText.Append(text.Text);
                    yield return new AiChatStreamEvent(AiChatStreamEventTypes.TextDelta, Text: text.Text);
                }
                else if (delta is ToolCallDelta toolCall)
                {
                    toolCalls.Add(toolCall.Call);
                }
                else if (delta is CompletionDone done)
                {
                    roundUsage = done.Usage;
                    finish = done.Reason;
                }
            }

            totalUsage = new AiUsage(
                totalUsage.PromptTokens + roundUsage.PromptTokens,
                totalUsage.CompletionTokens + roundUsage.CompletionTokens);

            if (finish == AiFinishReason.ToolCalls && toolCalls.Count > 0)
            {
                messages.Add(new AiMessage(
                    AiRole.Assistant,
                    roundText.Length > 0 ? roundText.ToString() : null,
                    toolCalls));

                foreach (var call in toolCalls)
                {
                    yield return new AiChatStreamEvent(AiChatStreamEventTypes.ToolStart, ToolName: call.Name);

                    AiToolExecutionResult result;
                    try
                    {
                        trip = trips.GetById(tripId, ownerId)!;
                        result = await tools.ExecuteAsync(trip, ownerId, call.Name, call.ArgumentsJson, ct);
                    }
                    catch (AiToolExecutionException ex)
                    {
                        result = new AiToolExecutionResult(
                            JsonSerializer.Serialize(new { error = ex.Message }),
                            [],
                            []);
                    }

                    if (result.UndoSteps is { Count: > 0 })
                        allUndoSteps.AddRange(result.UndoSteps);

                    if (result.Changes.Count > 0)
                    {
                        var tagged = result.Changes
                            .Select(c => c with { BatchId = batchId })
                            .ToList();
                        allChanges.AddRange(tagged);
                        yield return new AiChatStreamEvent(
                            AiChatStreamEventTypes.TripChanged,
                            Changes: tagged,
                            BatchId: batchId);
                    }

                    var summary = SummarizeToolResult(call.Name, result);
                    yield return new AiChatStreamEvent(
                        AiChatStreamEventTypes.ToolResult,
                        ToolName: call.Name,
                        ToolSummary: summary);

                    messages.Add(new AiMessage(AiRole.Tool, result.ResultJson, ToolCallId: call.Id));
                }

                continue;
            }

            break;
        }

        if (!await quota.TryRecordUsageAsync(ownerId, totalUsage, ct))
        {
            yield return Error("Daily AI token quota exceeded.");
            yield break;
        }

        yield return new AiChatStreamEvent(
            AiChatStreamEventTypes.Done,
            TokensUsed: totalUsage.TotalTokens,
            Changes: allChanges.Count > 0 ? allChanges : null,
            BatchId: allChanges.Count > 0 ? batchId : null,
            UndoSteps: allUndoSteps.Count > 0 ? allUndoSteps : null);
    }

    private static List<AiMessage> BuildMessages(Trip trip, Preference pref, AiChatRequest request, string message)
    {
        var tripContext = AiPromptBuilder.FormatTripContext(trip);
        var prefLine = AiPromptBuilder.FormatUserPreferences(
            pref.TravelStyle, pref.Pace, pref.Diet, pref.BudgetBand);
        var extra = string.Join("\n\n", new[] { AiPromptBuilder.ChatAssistantRules, tripContext, prefLine }
            .Where(s => !string.IsNullOrWhiteSpace(s)));

        var messages = new List<AiMessage> { AiPromptBuilder.BuildSystemMessage(extra) };

        var history = request.History ?? [];
        foreach (var prior in history.TakeLast(MaxHistoryMessages))
        {
            if (string.IsNullOrWhiteSpace(prior.Content))
                continue;
            var role = prior.Role.Equals("assistant", StringComparison.OrdinalIgnoreCase)
                ? AiRole.Assistant
                : AiRole.User;
            messages.Add(new AiMessage(role, prior.Content.Trim()));
        }

        messages.Add(new AiMessage(AiRole.User, message));
        return messages;
    }

    private static string SummarizeToolResult(string toolName, AiToolExecutionResult result)
    {
        if (result.Changes.Count > 0)
            return result.Changes[0].Action switch
            {
                "added" => $"Added {result.Changes[0].Title}",
                "removed" => $"Removed {result.Changes[0].Title}",
                "moved" => $"Moved {result.Changes[0].Title}",
                _ => toolName,
            };

        return toolName switch
        {
            "searchPlaces" => "Place search complete",
            "getWeather" => "Weather lookup complete",
            "suggestGapFill" => "Gap analysis complete",
            "searchActivities" => "Activity search complete",
            _ => toolName,
        };
    }

    private static AiChatStreamEvent Error(string message) =>
        new(AiChatStreamEventTypes.Error, Message: message);
}
