using System.Text.Json.Serialization;

namespace Wander.Api.Models;

/// <summary>
/// Result of the (currently stubbed) content-safety review a recap goes through before it's
/// discoverable. <see cref="Pending"/> exists for the real Azure AI Content Safety integration
/// (async review); the fake reviewer used today resolves synchronously to Approved/Rejected.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ModerationStatus
{
    Pending,
    Approved,
    Rejected
}

/// <summary>
/// A recap the owner has opted to publish publicly (Phase 8, Slice 0). Kept as its own table
/// (rather than fields on <see cref="Recap"/>) so publish metadata — moderation, discovery facets —
/// stays separate from the private, editable recap draft. One row per published <see cref="Recap"/>;
/// unpublishing soft-deletes it (revived, not duplicated, on re-publish).
/// </summary>
public class PublicRecap
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid RecapId { get; set; }

    /// <summary>Denormalized from the recap for partition/index queries without a join.</summary>
    public Guid TripId { get; set; }

    public string OwnerId { get; set; } = string.Empty;

    public ModerationStatus ModerationStatus { get; set; } = ModerationStatus.Pending;

    /// <summary>Why moderation rejected it, when <see cref="ModerationStatus"/> is <see cref="ModerationStatus.Rejected"/>.</summary>
    public string? ModerationReason { get; set; }

    /// <summary>Discovery facets (Slice 2 search filters): places visited, free-form tags.</summary>
    public List<string> Places { get; set; } = [];
    public List<string> Tags { get; set; } = [];
    public string? Season { get; set; }
    public string? BudgetBand { get; set; }

    public DateTimeOffset PublishedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Unpublish is a soft delete — consent revocation, recap deletion, and an explicit
    /// unpublish action all go through this same field.</summary>
    public DateTimeOffset? DeletedAt { get; set; }
}
