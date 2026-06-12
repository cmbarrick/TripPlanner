using System.Text.Json.Serialization;

namespace Wander.Api.Models;

/// <summary>What a recap summarizes. Trip-scoped recaps have a null <see cref="Recap.TargetId"/>;
/// day/event-scoped recaps point at a <see cref="Day"/> or <see cref="ItineraryItem"/> respectively
/// (same convention as <see cref="NoteScope"/>).</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum RecapScope
{
    Trip,
    Day,
    Event
}

/// <summary>Lifecycle of a recap: generated drafts are editable; finalizing locks the story in.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum RecapStatus
{
    Draft,
    Final
}

/// <summary>Tone/format the user picked for generation.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum RecapTone
{
    /// <summary>Flowing story prose.</summary>
    Narrative,
    /// <summary>Short highlight paragraphs.</summary>
    Highlights,
    /// <summary>Bulleted summary.</summary>
    Bullets
}

/// <summary>
/// An AI-drafted, user-editable story built from the trip's journal notes and transcripts
/// (architecture §"AI recap &amp; export"). First-class and versioned, separate from raw notes:
/// regenerating creates a new recap; saving edits bumps <see cref="Version"/>. Grounding is
/// auditable via <see cref="GeneratedFromNoteIds"/> and the per-section citations in
/// <see cref="SectionsJson"/>.
/// </summary>
public class Recap
{
    public const int MaxTitleLength = 200;
    public const int MaxBodyLength = 60_000;

    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TripId { get; set; }

    public string OwnerId { get; set; } = string.Empty;

    public RecapScope Scope { get; set; } = RecapScope.Trip;

    /// <summary>The <see cref="Day"/> or <see cref="ItineraryItem"/> id for day/event scope; null for trip scope.</summary>
    public Guid? TargetId { get; set; }

    public RecapTone Tone { get; set; } = RecapTone.Narrative;

    public string Title { get; set; } = string.Empty;

    /// <summary>The editable recap text (markdown). Composed from the generated sections, then owned by the user.</summary>
    public string Body { get; set; } = string.Empty;

    /// <summary>Generation metadata: JSON array of sections with per-section note citations
    /// (<c>[{"heading","body","noteIds"}]</c>). Kept as generated; user edits go to <see cref="Body"/>.</summary>
    public string? SectionsJson { get; set; }

    /// <summary>Every note id that grounded the generation (citation audit trail).</summary>
    public List<Guid> GeneratedFromNoteIds { get; set; } = [];

    /// <summary>Hash of (scope, target, tone, source note ids + their UpdatedAt). Lets generate
    /// short-circuit to the existing draft when nothing changed (cost control).</summary>
    public string SourceFingerprint { get; set; } = string.Empty;

    /// <summary>Bumped on every saved edit of <see cref="Title"/>/<see cref="Body"/>.</summary>
    public int Version { get; set; } = 1;

    public RecapStatus Status { get; set; } = RecapStatus.Draft;

    /// <summary>Capability token for the unlisted shareable web page (Phase 6 — private link only;
    /// public publishing with consent/moderation is Phase 8).</summary>
    public string? ShareToken { get; set; }

    /// <summary>Where this recap has been exported (relative share/PDF URLs).</summary>
    public List<string> ExportUrls { get; set; } = [];

    public int TokensUsed { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DeletedAt { get; set; }
}
