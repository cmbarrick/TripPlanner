using System.Text.Json.Serialization;

namespace Wander.Api.Models;

/// <summary>What a note is attached to. Trip-scoped notes have a null <see cref="Note.TargetId"/>;
/// day/event-scoped notes point at a <see cref="Day"/> or <see cref="ItineraryItem"/> respectively.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum NoteScope
{
    Trip,
    Day,
    Event
}

/// <summary>The kind of capture a note represents.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum NoteKind
{
    /// <summary>A plain text note.</summary>
    Text,
    /// <summary>A voice note: carries an audio <see cref="MediaAsset"/> and (once transcribed) its transcript.</summary>
    Voice,
    /// <summary>An answer to a reflection prompt (linked via <see cref="Note.PromptId"/>).</summary>
    PromptResponse
}

/// <summary>
/// A journal entry captured against a trip, a day, or a specific itinerary event. The itinerary
/// timeline doubles as the journal, so most notes are <see cref="NoteScope.Event"/>-scoped.
/// Soft-deleted (see <see cref="DeletedAt"/>) so capture is never silently lost.
/// </summary>
public class Note
{
    public const int MaxBodyLength = 10_000;

    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Owning trip; every note belongs to exactly one trip.</summary>
    public Guid TripId { get; set; }

    public string OwnerId { get; set; } = string.Empty;

    public NoteScope Scope { get; set; } = NoteScope.Trip;

    /// <summary>The <see cref="Day"/> or <see cref="ItineraryItem"/> id for day/event scope; null for trip scope.</summary>
    public Guid? TargetId { get; set; }

    public NoteKind Kind { get; set; } = NoteKind.Text;

    public string? BodyText { get; set; }

    /// <summary>For <see cref="NoteKind.PromptResponse"/> notes: the reflection prompt this answers.</summary>
    public Guid? PromptId { get; set; }

    public List<MediaAsset> MediaAssets { get; set; } = [];

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DeletedAt { get; set; }
}
