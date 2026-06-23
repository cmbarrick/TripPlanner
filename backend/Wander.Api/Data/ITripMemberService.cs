using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>A trip member as shown to the owner managing collaborators.</summary>
public record TripMemberView(
    Guid Id,
    Guid UserId,
    string Email,
    string DisplayName,
    TripMemberRole Role,
    DateTimeOffset CreatedAt);

public enum InviteStatus
{
    Invited,
    UserNotFound,
    AlreadyOwner
}

public record InviteOutcome(InviteStatus Status, TripMemberView? Member);

/// <summary>
/// Account-based trip sharing (Phase 7, Slice 2): owner-managed membership with owner/editor/viewer
/// roles. Inviting targets an already-registered user by email; pending invites for unregistered
/// emails are deferred. Authorization (owner-only) is the caller's responsibility.
/// </summary>
public interface ITripMemberService
{
    IReadOnlyList<TripMemberView> ListMembers(Guid tripId);
    InviteOutcome InviteByEmail(Guid tripId, string tripOwnerId, string email, TripMemberRole role);
    bool ChangeRole(Guid tripId, Guid memberId, TripMemberRole role);
    bool RemoveMember(Guid tripId, Guid memberId);
}

public class TripMemberService(WanderDbContext db) : ITripMemberService
{
    public IReadOnlyList<TripMemberView> ListMembers(Guid tripId) =>
        db.TripMembers.AsNoTracking()
            .Where(m => m.TripId == tripId && m.DeletedAt == null)
            .Join(
                db.Users.AsNoTracking(),
                m => m.UserId,
                u => u.Id,
                (m, u) => new TripMemberView(m.Id, u.Id, u.Email, u.DisplayName, m.Role, m.CreatedAt))
            .OrderBy(v => v.CreatedAt)
            .ToList();

    public InviteOutcome InviteByEmail(Guid tripId, string tripOwnerId, string email, TripMemberRole role)
    {
        var normalized = email.Trim().ToLowerInvariant();
        var user = db.Users
            .SingleOrDefault(u => u.Email.ToLower() == normalized && u.DeletedAt == null);
        if (user is null)
            return new InviteOutcome(InviteStatus.UserNotFound, null);

        // The owner can't be invited to their own trip.
        if (user.OwnerId == tripOwnerId)
            return new InviteOutcome(InviteStatus.AlreadyOwner, null);

        var now = DateTimeOffset.UtcNow;
        var member = db.TripMembers.SingleOrDefault(m => m.TripId == tripId && m.UserId == user.Id);
        if (member is null)
        {
            member = new TripMember
            {
                TripId = tripId,
                OwnerId = tripOwnerId,
                UserId = user.Id,
                Role = role,
                CreatedAt = now,
                UpdatedAt = now,
            };
            db.TripMembers.Add(member);
        }
        else
        {
            member.DeletedAt = null;
            member.Role = role;
            member.UpdatedAt = now;
        }

        db.SaveChanges();
        return new InviteOutcome(
            InviteStatus.Invited,
            new TripMemberView(member.Id, user.Id, user.Email, user.DisplayName, member.Role, member.CreatedAt));
    }

    public bool ChangeRole(Guid tripId, Guid memberId, TripMemberRole role)
    {
        var member = db.TripMembers.SingleOrDefault(m =>
            m.Id == memberId && m.TripId == tripId && m.DeletedAt == null);
        if (member is null)
            return false;

        member.Role = role;
        member.UpdatedAt = DateTimeOffset.UtcNow;
        db.SaveChanges();
        return true;
    }

    public bool RemoveMember(Guid tripId, Guid memberId)
    {
        var member = db.TripMembers.SingleOrDefault(m =>
            m.Id == memberId && m.TripId == tripId && m.DeletedAt == null);
        if (member is null)
            return false;

        member.DeletedAt = DateTimeOffset.UtcNow;
        member.UpdatedAt = member.DeletedAt.Value;
        db.SaveChanges();
        return true;
    }
}
