namespace Wander.Api.Ai;

public sealed record AiChatMessageDto(string Role, string Content);

public sealed record AiChatRequest(
    string Message,
    IReadOnlyList<AiChatMessageDto>? History = null);

public sealed record AiTripChange(
    string Action,
    Guid? ItemId,
    string Title,
    int? DayNumber,
    string? Detail = null,
    Guid? BatchId = null);

/// <summary>SSE payload — discriminated by <see cref="Type"/>.</summary>
public sealed record AiChatStreamEvent(
    string Type,
    string? Text = null,
    string? ToolName = null,
    string? ToolSummary = null,
    IReadOnlyList<AiTripChange>? Changes = null,
    int? TokensUsed = null,
    string? Message = null,
    Guid? BatchId = null,
    IReadOnlyList<AiUndoStep>? UndoSteps = null);

public static class AiChatStreamEventTypes
{
    public const string TextDelta = "text_delta";
    public const string ToolStart = "tool_start";
    public const string ToolResult = "tool_result";
    public const string TripChanged = "trip_changed";
    public const string Done = "done";
    public const string Error = "error";
}

public sealed class AiToolExecutionException : Exception
{
    public AiToolExecutionException(string message) : base(message) { }
}
