namespace Wander.Api.Models;

/// <summary>Daily AI token consumption per user (prompt + completion), UTC date bucket.</summary>
public class AiTokenUsage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string OwnerId { get; set; } = string.Empty;

    /// <summary>UTC calendar date for the quota bucket.</summary>
    public DateOnly UsageDate { get; set; }

    public int PromptTokens { get; set; }
    public int CompletionTokens { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public int TotalTokens => PromptTokens + CompletionTokens;
}
