using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>
/// The caller's resolved access to a trip. <see cref="TripOwnerId"/> is the trip's real owner —
/// the data-partition key the owner-scoped repository expects — while <see cref="Role"/> is the
/// caller's capability on that trip (owner / editor / viewer).
/// </summary>
public record TripAccess(Guid TripId, string TripOwnerId, TripMemberRole Role)
{
    public bool CanView => true;
    public bool CanEdit => Role is TripMemberRole.Owner or TripMemberRole.Editor;
    public bool CanManage => Role is TripMemberRole.Owner;
}

/// <summary>
/// Resolves a caller's access to a trip without re-scoping the existing owner-keyed repository.
/// Resolution order: direct owner → trip member (via the user-id bridge) → no access (<c>null</c>).
/// </summary>
public interface ITripAccessService
{
    TripAccess? Resolve(Guid tripId, string callerOwnerId);
}

public class TripAccessService(WanderDbContext db, IUserService users) : ITripAccessService
{
    public TripAccess? Resolve(Guid tripId, string callerOwnerId)
    {
        var trip = db.Trips.AsNoTracking()
            .Where(t => t.Id == tripId && t.DeletedAt == null)
            .Select(t => new { t.OwnerId })
            .FirstOrDefault();
        if (trip is null)
            return null;

        if (trip.OwnerId == callerOwnerId)
            return new TripAccess(tripId, trip.OwnerId, TripMemberRole.Owner);

        var userId = users.FindUserId(callerOwnerId);
        if (userId is null)
            return null;

        var member = db.TripMembers.AsNoTracking()
            .Where(m => m.TripId == tripId && m.UserId == userId && m.DeletedAt == null)
            .Select(m => new { m.Role })
            .FirstOrDefault();
        if (member is null)
            return null;

        return new TripAccess(tripId, trip.OwnerId, member.Role);
    }
}
