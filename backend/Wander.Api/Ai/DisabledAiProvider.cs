namespace Wander.Api.Ai;

/// <summary>
/// No-op provider selected when Azure OpenAI is not configured. Preserves the local-first
/// guarantee: the app builds and runs with no AI key.
/// </summary>
public sealed class DisabledAiProvider : IAiProvider
{
    public bool IsEnabled => false;

    public async IAsyncEnumerable<AiCompletionDelta> CompleteAsync(
        AiCompletionRequest request,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        await Task.CompletedTask;
        yield return new TextDelta(
            "AI planning is not configured on this server. You can still plan manually.");
        yield return new CompletionDone(new AiUsage(0, 0), AiFinishReason.Disabled);
    }
}
