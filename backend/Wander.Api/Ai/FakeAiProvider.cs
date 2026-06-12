namespace Wander.Api.Ai;

/// <summary>
/// Deterministic provider for CI/integration tests (<c>Ai:UseFake=true</c>). Never calls the network.
/// </summary>
public sealed class FakeAiProvider : IAiProvider
{
    public const string SampleDraftJson = """
        {"summary":"Sample draft itinerary","items":[
          {"dayNumber":1,"type":"Activity","title":"Morning stroll","startTime":"09:00","endTime":null,"locationName":"Old town","address":null,"cost":null,"notes":"Sample stop"},
          {"dayNumber":1,"type":"Food","title":"Local lunch","startTime":"12:30","endTime":null,"locationName":null,"address":null,"cost":25,"notes":null}
        ]}
        """;

    public const string SampleAddItemArgs = """
        {"dayNumber":1,"type":"Food","title":"Coffee break","startTime":"10:30"}
        """;

    public const string SampleRecapJson = """
        {"title":"A sample trip recap","sections":[
          {"heading":"Wandering the old town","body":"We strolled the old town and loved the market.","noteIds":["n1"]},
          {"heading":"Looking back","body":"A relaxed pace suited us perfectly.","noteIds":["n1","n2"]}
        ]}
        """;

    public bool IsEnabled => true;

    public async IAsyncEnumerable<AiCompletionDelta> CompleteAsync(
        AiCompletionRequest request,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        await Task.CompletedTask;

        if (request.Format == AiResponseFormat.JsonSchema)
        {
            yield return new TextDelta(
                request.DeploymentKind == "recap" ? SampleRecapJson : SampleDraftJson);
            yield return new CompletionDone(new AiUsage(40, 60), AiFinishReason.Stop);
            yield break;
        }

        if (request.Tools.Count > 0)
        {
            var hadToolResults = request.Messages.Any(m => m.Role == AiRole.Tool);
            if (!hadToolResults)
            {
                yield return new ToolCallDelta(new AiToolCall(
                    "fake-call-1",
                    "addItineraryItem",
                    SampleAddItemArgs));
                yield return new CompletionDone(new AiUsage(25, 5), AiFinishReason.ToolCalls);
                yield break;
            }

            yield return new TextDelta("I've added a coffee break to day 1.");
            yield return new CompletionDone(new AiUsage(15, 20), AiFinishReason.Stop);
            yield break;
        }

        var lastUser = request.Messages.LastOrDefault(m => m.Role == AiRole.User)?.Content ?? "";
        yield return new TextDelta($"[fake-ai] Received: {lastUser.Trim()}");
        yield return new CompletionDone(new AiUsage(10, 5), AiFinishReason.Stop);
    }
}
