using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>A reaction as returned to clients.</summary>
public record ReactionView(
    Guid Id,
    ReactionTargetType TargetType,
    Guid TargetId,
    string Emoji,
    string OwnerId,
    DateTimeOffset CreatedAt);

/// <summary>Outcome of a toggle: whether the reaction is now present, and the affected row.</summary>
public record ToggleReactionResult(bool Added, ReactionView Reaction);

/// <summary>
/// Emoji reactions on a trip/event/recap (Phase 7, Slice 4). Toggling is idempotent per
/// (target, user, emoji): a second toggle removes it. Authorization (trip access) is the caller's
/// responsibility — the service trusts the resolved trip + actor passed in.
/// </summary>
public interface IReactionService
{
    IReadOnlyList<ReactionView> ListForTrip(Guid tripId);

    ToggleReactionResult Toggle(
        Guid tripId, string ownerId, ReactionTargetType targetType, Guid targetId, string emoji);
}

public class ReactionService(WanderDbContext db) : IReactionService
{
    public IReadOnlyList<ReactionView> ListForTrip(Guid tripId) =>
        db.Reactions.AsNoTracking()
            .Where(r => r.TripId == tripId && r.DeletedAt == null)
            .OrderBy(r => r.CreatedAt)
            .Select(r => new ReactionView(r.Id, r.TargetType, r.TargetId, r.Emoji, r.OwnerId, r.CreatedAt))
            .ToList();

    public ToggleReactionResult Toggle(
        Guid tripId, string ownerId, ReactionTargetType targetType, Guid targetId, string emoji)
    {
        var now = DateTimeOffset.UtcNow;
        var existing = db.Reactions.SingleOrDefault(r =>
            r.TripId == tripId &&
            r.OwnerId == ownerId &&
            r.TargetType == targetType &&
            r.TargetId == targetId &&
            r.Emoji == emoji);

        if (existing is null)
        {
            existing = new Reaction
            {
                TripId = tripId,
                OwnerId = ownerId,
                TargetType = targetType,
                TargetId = targetId,
                Emoji = emoji,
                CreatedAt = now,
                UpdatedAt = now,
            };
            db.Reactions.Add(existing);
            db.SaveChanges();
            return new ToggleReactionResult(true, ToView(existing));
        }

        // Toggle: a soft-deleted row revives (added), a live row goes away (removed).
        var added = existing.DeletedAt is not null;
        existing.DeletedAt = added ? null : now;
        existing.UpdatedAt = now;
        db.SaveChanges();
        return new ToggleReactionResult(added, ToView(existing));
    }

    private static ReactionView ToView(Reaction r) =>
        new(r.Id, r.TargetType, r.TargetId, r.Emoji, r.OwnerId, r.CreatedAt);
}
