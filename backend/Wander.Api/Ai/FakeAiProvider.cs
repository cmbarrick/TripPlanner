namespace Wander.Api.Ai;

/// <summary>
/// Deterministic provider for CI/integration tests (<c>Ai:UseFake=true</c>). Never calls the network.
/// </summary>
public sealed class FakeAiProvider : IAiProvider
{
    public bool IsEnabled => true;

    public async IAsyncEnumerable<AiCompletionDelta> CompleteAsync(
        AiCompletionRequest request,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        await Task.CompletedTask;
        var lastUser = request.Messages.LastOrDefault(m => m.Role == AiRole.User)?.Content ?? "";
        yield return new TextDelta($"[fake-ai] Received: {lastUser.Trim()}");
        yield return new CompletionDone(new AiUsage(10, 5), AiFinishReason.Stop);
    }
}
