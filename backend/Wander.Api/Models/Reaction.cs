using System.Text.Json.Serialization;

namespace Wander.Api.Models;

/// <summary>What a reaction is attached to within a trip.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ReactionTargetType
{
    /// <summary>The whole trip.</summary>
    Trip,
    /// <summary>A specific itinerary item/event.</summary>
    Item,
    /// <summary>A recap.</summary>
    Recap
}

/// <summary>
/// A lightweight social reaction (emoji) by a trip member on the trip, an event, or a recap
/// (Phase 7, Slice 4). Scoped to <see cref="TripId"/> for access + partitioning; soft-deleted so a
/// toggle-off can be reversed without losing history.
/// </summary>
public class Reaction
{
    public const int MaxEmojiLength = 32;

    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Owning trip — the access/partition scope for every reaction.</summary>
    public Guid TripId { get; set; }

    /// <summary>The reacting user (auth subject).</summary>
    public string OwnerId { get; set; } = string.Empty;

    public ReactionTargetType TargetType { get; set; } = ReactionTargetType.Trip;

    /// <summary>The target's id; equals <see cref="TripId"/> for <see cref="ReactionTargetType.Trip"/>.</summary>
    public Guid TargetId { get; set; }

    public string Emoji { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DeletedAt { get; set; }
}
