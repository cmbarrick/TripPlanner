namespace Wander.Api.Ai;

/// <summary>Configuration for Azure OpenAI and per-user quotas (<c>Ai:*</c> app settings).</summary>
public sealed class AiOptions
{
    public const string SectionName = "Ai";

    public string? Endpoint { get; set; }
    public string? ApiKey { get; set; }

    /// <summary>Stronger model deployment for interactive chat (e.g. gpt-4o).</summary>
    public string ChatDeployment { get; set; } = "gpt-4o";

    /// <summary>Cheaper model deployment for drafts/gap-fill (e.g. gpt-4o-mini).</summary>
    public string DraftDeployment { get; set; } = "gpt-4o-mini";

    /// <summary>Embedding model deployment for semantic search (Phase 8, Slice 2).</summary>
    public string EmbeddingDeployment { get; set; } = "text-embedding-3-small";

    /// <summary>Per-user daily token cap (prompt + completion). Enforced via Postgres.</summary>
    public int DailyTokenLimit { get; set; } = 50_000;

    /// <summary>When true, use <see cref="FakeAiProvider"/> instead of Azure (integration tests).</summary>
    public bool UseFake { get; set; }
}
