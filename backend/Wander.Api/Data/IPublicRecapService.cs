using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

public enum PublishStatus
{
    Published,
    /// <summary>The trip hasn't ended yet — public publishing is post-trip only (safety gate).</summary>
    TripNotEnded,
    /// <summary>The owner hasn't opted in to publishing (<c>ConsentSetting.PublishEnabled</c>).</summary>
    PublishNotConsented,
    RecapNotFound,
    Rejected,
    /// <summary>PII was detected and <see cref="PublishRequest.AcknowledgePii"/> wasn't set — the
    /// recap wasn't published; the caller must review the findings, then edit or acknowledge.</summary>
    PiiReviewRequired
}

public record PublicRecapView(
    Guid Id,
    Guid RecapId,
    Guid TripId,
    ModerationStatus ModerationStatus,
    string? ModerationReason,
    IReadOnlyList<string> Places,
    IReadOnlyList<string> Tags,
    string? Season,
    string? BudgetBand,
    DateTimeOffset PublishedAt);

public record PublishRequest(
    IReadOnlyList<string>? Places = null,
    IReadOnlyList<string>? Tags = null,
    string? Season = null,
    string? BudgetBand = null,
    /// <summary>The caller has reviewed the PII findings from a prior attempt and wants to publish
    /// anyway (e.g. it's a public business address, not personal). Skips the PII gate this call.</summary>
    bool AcknowledgePii = false);

public record PublishOutcome(PublishStatus Status, PublicRecapView? View, IReadOnlyList<PiiFinding>? PiiFindings = null);

/// <summary>
/// Publishing a recap publicly (Phase 8). Gated, in order: the trip must have ended (server-enforced
/// safety rule — never broadcast "I'm here right now"); the owner must have opted in via
/// <c>ConsentSetting.PublishEnabled</c>; PII findings must be reviewed (or explicitly acknowledged);
/// then content moderation runs. Authorization (recap ownership) is the caller's responsibility, same
/// convention as <see cref="ITripShareService"/>/<see cref="IReactionService"/>.
/// </summary>
public interface IPublicRecapService
{
    Task<PublishOutcome> PublishAsync(
        Guid tripId, Guid recapId, string ownerId, PublishRequest request, CancellationToken ct = default);

    /// <summary>Soft-deletes the publish record (and its search index entry); false if nothing was published.</summary>
    Task<bool> UnpublishAsync(Guid tripId, Guid recapId, string ownerId, CancellationToken ct = default);

    /// <summary>The owner's view of a recap's publish state, or null if never published.</summary>
    PublicRecapView? GetStatus(Guid recapId, string ownerId);
}

public class PublicRecapService(
    WanderDbContext db,
    IConsentService consent,
    IContentModerationService moderation,
    IPiiDetectionService pii,
    ISearchIndexService searchIndex)
    : IPublicRecapService
{
    public async Task<PublishOutcome> PublishAsync(
        Guid tripId, Guid recapId, string ownerId, PublishRequest request, CancellationToken ct = default)
    {
        var recap = await db.Recaps.SingleOrDefaultAsync(
            r => r.Id == recapId && r.TripId == tripId && r.OwnerId == ownerId && r.DeletedAt == null, ct);
        if (recap is null)
            return new PublishOutcome(PublishStatus.RecapNotFound, null);

        var trip = await db.Trips.AsNoTracking().SingleOrDefaultAsync(
            t => t.Id == tripId && t.OwnerId == ownerId && t.DeletedAt == null, ct);
        if (trip is null)
            return new PublishOutcome(PublishStatus.RecapNotFound, null);

        // Post-trip gate: today must be on or after the trip's end date.
        if (DateOnly.FromDateTime(DateTimeOffset.UtcNow.UtcDateTime) < trip.EndDate)
            return new PublishOutcome(PublishStatus.TripNotEnded, null);

        var consentSetting = await consent.GetOrCreateAsync(ownerId, ct);
        if (!consentSetting.PublishEnabled)
            return new PublishOutcome(PublishStatus.PublishNotConsented, null);

        if (!request.AcknowledgePii)
        {
            var findings = pii.Detect($"{recap.Title}\n\n{recap.Body}");
            if (findings.Count > 0)
                return new PublishOutcome(PublishStatus.PiiReviewRequired, null, findings);
        }

        var review = await moderation.ReviewAsync(recap.Title, recap.Body, ct);

        var now = DateTimeOffset.UtcNow;
        var existing = await db.PublicRecaps.SingleOrDefaultAsync(p => p.RecapId == recapId, ct);
        if (existing is null)
        {
            existing = new PublicRecap
            {
                RecapId = recapId,
                TripId = tripId,
                OwnerId = ownerId,
                PublishedAt = now,
                CreatedAt = now,
            };
            db.PublicRecaps.Add(existing);
        }
        else
        {
            // Revive (or re-review) rather than duplicate — re-publishing after an edit re-runs
            // moderation since the content may have changed.
            existing.DeletedAt = null;
            existing.PublishedAt = now;
        }

        existing.ModerationStatus = review.Status;
        existing.ModerationReason = review.Reason;
        existing.Places = request.Places?.ToList() ?? existing.Places;
        existing.Tags = request.Tags?.ToList() ?? existing.Tags;
        existing.Season = request.Season ?? existing.Season;
        existing.BudgetBand = request.BudgetBand ?? existing.BudgetBand;
        existing.UpdatedAt = now;

        await db.SaveChangesAsync(ct);

        // Only discoverable (Approved) content gets indexed; a rejected re-publish must drop any
        // stale chunk from an earlier approved version.
        if (review.Status == ModerationStatus.Approved)
            await searchIndex.IndexAsync(existing.Id, ct);
        else
            await searchIndex.RemoveAsync(existing.Id, ct);

        return review.Status == ModerationStatus.Rejected
            ? new PublishOutcome(PublishStatus.Rejected, ToView(existing))
            : new PublishOutcome(PublishStatus.Published, ToView(existing));
    }

    public async Task<bool> UnpublishAsync(Guid tripId, Guid recapId, string ownerId, CancellationToken ct = default)
    {
        var existing = await db.PublicRecaps.SingleOrDefaultAsync(p =>
            p.RecapId == recapId && p.TripId == tripId && p.OwnerId == ownerId && p.DeletedAt == null, ct);
        if (existing is null)
            return false;

        existing.DeletedAt = DateTimeOffset.UtcNow;
        existing.UpdatedAt = existing.DeletedAt.Value;
        await db.SaveChangesAsync(ct);
        await searchIndex.RemoveAsync(existing.Id, ct);
        return true;
    }

    public PublicRecapView? GetStatus(Guid recapId, string ownerId)
    {
        var existing = db.PublicRecaps.AsNoTracking()
            .SingleOrDefault(p => p.RecapId == recapId && p.OwnerId == ownerId && p.DeletedAt == null);
        return existing is null ? null : ToView(existing);
    }

    private static PublicRecapView ToView(PublicRecap p) => new(
        p.Id, p.RecapId, p.TripId, p.ModerationStatus, p.ModerationReason,
        p.Places, p.Tags, p.Season, p.BudgetBand, p.PublishedAt);
}
