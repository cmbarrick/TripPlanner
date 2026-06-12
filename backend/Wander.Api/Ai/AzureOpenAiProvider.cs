using Azure;
using Azure.AI.OpenAI;
using Microsoft.Extensions.Options;
using OpenAI.Chat;

namespace Wander.Api.Ai;

/// <summary>Azure OpenAI implementation of <see cref="IAiProvider"/>.</summary>
public sealed class AzureOpenAiProvider : IAiProvider
{
    private readonly AzureOpenAIClient _client;
    private readonly AiOptions _options;

    public AzureOpenAiProvider(AzureOpenAIClient client, IOptions<AiOptions> options)
    {
        _client = client;
        _options = options.Value;
    }

    public bool IsEnabled => true;

    public async IAsyncEnumerable<AiCompletionDelta> CompleteAsync(
        AiCompletionRequest request,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        var deployment = ResolveDeployment(request.DeploymentKind);
        var chatClient = _client.GetChatClient(deployment);
        var messages = request.Messages.Select(ToChatMessage).ToList();

        var options = new ChatCompletionOptions
        {
            Temperature = (float)request.Temperature,
        };
        if (request.MaxOutputTokens is { } maxOut)
            options.MaxOutputTokenCount = maxOut;

        foreach (var tool in request.Tools)
        {
            options.Tools.Add(ChatTool.CreateFunctionTool(
                tool.Name,
                tool.Description,
                BinaryData.FromString(tool.ParametersJsonSchema)));
        }

        if (request.Format == AiResponseFormat.JsonSchema && !string.IsNullOrWhiteSpace(request.JsonSchema))
        {
            options.ResponseFormat = ChatResponseFormat.CreateJsonSchemaFormat(
                "wander_response",
                BinaryData.FromString(request.JsonSchema),
                jsonSchemaIsStrict: true);
        }

        var usage = new AiUsage(0, 0);
        var finish = AiFinishReason.Stop;
        var toolCalls = new Dictionary<int, (string Id, string Name, System.Text.StringBuilder Args)>();

        await foreach (var update in chatClient.CompleteChatStreamingAsync(messages, options, ct))
        {
            if (update.ContentUpdate.Count > 0)
            {
                foreach (var part in update.ContentUpdate)
                {
                    if (!string.IsNullOrEmpty(part.Text))
                        yield return new TextDelta(part.Text);
                }
            }

            foreach (var toolUpdate in update.ToolCallUpdates)
            {
                if (!toolCalls.TryGetValue(toolUpdate.Index, out var existing))
                {
                    existing = (toolUpdate.ToolCallId ?? Guid.NewGuid().ToString("N"),
                        toolUpdate.FunctionName ?? "",
                        new System.Text.StringBuilder());
                    toolCalls[toolUpdate.Index] = existing;
                }

                if (!string.IsNullOrEmpty(toolUpdate.FunctionName))
                    existing.Name = toolUpdate.FunctionName;
                if (toolUpdate.FunctionArgumentsUpdate is { } argChunk)
                    existing.Args.Append(argChunk.ToString());
            }

            if (update.Usage is { } u)
            {
                usage = new AiUsage(u.InputTokenCount, u.OutputTokenCount);
            }

            if (update.FinishReason.HasValue)
                finish = MapFinishReason(update.FinishReason.Value);
        }

        foreach (var (_, call) in toolCalls.OrderBy(kv => kv.Key))
        {
            yield return new ToolCallDelta(new AiToolCall(
                call.Id,
                call.Name,
                call.Args.ToString()));
            finish = AiFinishReason.ToolCalls;
        }

        yield return new CompletionDone(usage, finish);
    }

    // Recaps ride the cheaper draft deployment — first drafts are user-edited anyway.
    private string ResolveDeployment(string? kind) =>
        string.Equals(kind, "draft", StringComparison.OrdinalIgnoreCase)
        || string.Equals(kind, "recap", StringComparison.OrdinalIgnoreCase)
            ? _options.DraftDeployment
            : _options.ChatDeployment;

    private static ChatMessage ToChatMessage(AiMessage message) => message.Role switch
    {
        AiRole.System => new SystemChatMessage(message.Content ?? ""),
        AiRole.User => new UserChatMessage(message.Content ?? ""),
        AiRole.Assistant => message.ToolCalls is { Count: > 0 } calls
            ? new AssistantChatMessage(calls.Select(c =>
                ChatToolCall.CreateFunctionToolCall(c.Id, c.Name, BinaryData.FromString(c.ArgumentsJson))).ToList())
            : new AssistantChatMessage(message.Content ?? ""),
        AiRole.Tool => new ToolChatMessage(message.ToolCallId ?? "", message.Content ?? ""),
        _ => new UserChatMessage(message.Content ?? ""),
    };

    private static AiFinishReason MapFinishReason(ChatFinishReason reason) => reason switch
    {
        ChatFinishReason.Stop => AiFinishReason.Stop,
        ChatFinishReason.ToolCalls => AiFinishReason.ToolCalls,
        ChatFinishReason.Length => AiFinishReason.Length,
        ChatFinishReason.ContentFilter => AiFinishReason.ContentFilter,
        _ => AiFinishReason.Stop,
    };
}
