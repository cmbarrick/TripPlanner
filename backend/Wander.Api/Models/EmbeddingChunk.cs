using System.Text.Json.Serialization;

namespace Wander.Api.Models;

/// <summary>What an embedding chunk was generated from. Only public recaps are indexed today; the
/// enum exists so other consented public content (e.g. individual sections) can join in later.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum EmbeddingSource
{
    PublicRecap
}

/// <summary>
/// A vector-embedded chunk of consented public content (Phase 8, Slice 2), per the architecture
/// doc's <c>EmbeddingChunk</c> design. One chunk per published recap today (title+body, whole);
/// per-section chunking is a future refinement once corpus size justifies it. Stored as a plain
/// <c>float[]</c> rather than a native pgvector column — similarity is computed client-side
/// (see <see cref="Wander.Api.Data.ISearchService"/>), so no Postgres extension is required, and
/// the same code path works identically against the EF Core in-memory provider in tests.
/// </summary>
public class EmbeddingChunk
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public EmbeddingSource Source { get; set; } = EmbeddingSource.PublicRecap;

    /// <summary>The <see cref="PublicRecap"/> id this chunk was generated from.</summary>
    public Guid SourceId { get; set; }

    /// <summary>Denormalized for scoping/debugging; not used for authorization.</summary>
    public Guid TripId { get; set; }

    /// <summary>The text that was embedded (kept for debugging/display, not re-derived on search).</summary>
    public string Text { get; set; } = string.Empty;

    public float[] Vector { get; set; } = [];

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
