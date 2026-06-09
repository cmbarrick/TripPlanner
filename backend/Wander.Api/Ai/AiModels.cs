namespace Wander.Api.Ai;

public enum AiRole
{
    System,
    User,
    Assistant,
    Tool
}

public enum AiResponseFormat
{
    Text,
    JsonSchema
}

public enum AiFinishReason
{
    Stop,
    ToolCalls,
    Length,
    ContentFilter,
    Disabled
}

public sealed record AiMessage(
    AiRole Role,
    string? Content,
    IReadOnlyList<AiToolCall>? ToolCalls = null,
    string? ToolCallId = null);

public sealed record AiToolCall(string Id, string Name, string ArgumentsJson);

public sealed record AiToolSchema(string Name, string Description, string ParametersJsonSchema);

public sealed record AiCompletionRequest(
    IReadOnlyList<AiMessage> Messages,
    IReadOnlyList<AiToolSchema> Tools,
    AiResponseFormat Format = AiResponseFormat.Text,
    string? JsonSchema = null,
    int? MaxOutputTokens = null,
    double Temperature = 0.4,
    /// <summary>When set, selects the deployment (e.g. chat vs draft). Provider interprets.</summary>
    string? DeploymentKind = null);

public sealed record AiUsage(int PromptTokens, int CompletionTokens)
{
    public int TotalTokens => PromptTokens + CompletionTokens;
}

public abstract record AiCompletionDelta;

public sealed record TextDelta(string Text) : AiCompletionDelta;

public sealed record ToolCallDelta(AiToolCall Call) : AiCompletionDelta;

public sealed record CompletionDone(AiUsage Usage, AiFinishReason Reason) : AiCompletionDelta;

public sealed record AiStatusResponse(
    bool Enabled,
    int DailyTokenLimit,
    int TokensUsedToday,
    int TokensRemainingToday);
