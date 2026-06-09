namespace Wander.Api.Ai;

/// <summary>
/// Provider-agnostic LLM seam. Azure OpenAI in cloud; disabled/fake in local-first dev and CI.
/// The orchestrator (<see cref="AiPlanningService"/>, Phase 5 slice 3+) executes tool calls —
/// this interface only performs one model turn at a time.
/// </summary>
public interface IAiProvider
{
    /// <summary>False when no AI credentials are configured (local-first guarantee).</summary>
    bool IsEnabled { get; }

    /// <summary>
    /// One model turn. Streams text deltas, tool-call requests, then a final usage record.
    /// </summary>
    IAsyncEnumerable<AiCompletionDelta> CompleteAsync(AiCompletionRequest request, CancellationToken ct);
}
