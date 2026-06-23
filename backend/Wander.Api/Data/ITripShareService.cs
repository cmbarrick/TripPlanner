using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>A shareable link to a trip, as returned to the owner managing shares.</summary>
public record TripShareView(
    Guid Id,
    TripMemberRole Role,
    string Token,
    string ShareUrl,
    DateTimeOffset? ExpiresAt,
    DateTimeOffset CreatedAt);

/// <summary>A trip exposed through a valid link token, with the capability the link grants.</summary>
public record SharedTripView(Trip Trip, TripMemberRole Role);

public enum RedeemStatus
{
    Redeemed,
    AlreadyOwner,
    NotFound
}

/// <summary>Result of an authenticated user redeeming a link into trip membership.</summary>
public record RedeemOutcome(RedeemStatus Status, Guid TripId, TripMemberRole Role);

/// <summary>
/// Link-based trip sharing (Phase 7, Slice 1). Generalizes the Phase 6 recap share-token pattern:
/// an unguessable capability token grants <see cref="TripMemberRole.Viewer"/> or
/// <see cref="TripMemberRole.Editor"/> access to a single trip, optionally with an expiry.
/// Authorization for the management methods is the caller's responsibility (resolve owner first).
/// </summary>
public interface ITripShareService
{
    /// <summary>Issues a new link for a trip. <paramref name="tripOwnerId"/> is the resolved trip owner.</summary>
    TripShareView CreateLink(Guid tripId, string tripOwnerId, TripMemberRole role, DateTimeOffset? expiresAt);

    /// <summary>Lists active (non-revoked) links for a trip.</summary>
    IReadOnlyList<TripShareView> ListLinks(Guid tripId);

    /// <summary>Revokes (soft-deletes) a link. Returns false when the link is missing for the trip.</summary>
    bool RevokeLink(Guid tripId, Guid shareId);

    /// <summary>Resolves a link token to a trip + granted role, or null when invalid/expired/revoked.</summary>
    SharedTripView? GetSharedTrip(string token);

    /// <summary>Redeems a link for an authenticated caller, creating/upgrading a trip membership.</summary>
    RedeemOutcome Redeem(string token, string callerOwnerId);
}

public class TripShareService(WanderDbContext db, ITripRepository trips, IUserService users) : ITripShareService
{
    public TripShareView CreateLink(Guid tripId, string tripOwnerId, TripMemberRole role, DateTimeOffset? expiresAt)
    {
        var now = DateTimeOffset.UtcNow;
        var share = new TripShare
        {
            TripId = tripId,
            OwnerId = tripOwnerId,
            Mode = TripShareMode.Link,
            Role = role,
            Token = NewToken(),
            ExpiresAt = expiresAt,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.TripShares.Add(share);
        db.SaveChanges();
        return ToView(share);
    }

    public IReadOnlyList<TripShareView> ListLinks(Guid tripId) =>
        db.TripShares.AsNoTracking()
            .Where(s => s.TripId == tripId && s.Mode == TripShareMode.Link && s.DeletedAt == null)
            .OrderByDescending(s => s.CreatedAt)
            .AsEnumerable()
            .Select(ToView)
            .ToList();

    public bool RevokeLink(Guid tripId, Guid shareId)
    {
        var share = db.TripShares.SingleOrDefault(s =>
            s.Id == shareId && s.TripId == tripId && s.Mode == TripShareMode.Link && s.DeletedAt == null);
        if (share is null)
            return false;

        share.DeletedAt = DateTimeOffset.UtcNow;
        share.UpdatedAt = share.DeletedAt.Value;
        db.SaveChanges();
        return true;
    }

    public SharedTripView? GetSharedTrip(string token)
    {
        var share = FindActiveLink(token);
        if (share is null)
            return null;

        // The token grants read access; load the trip through its real owner partition.
        var trip = trips.GetById(share.TripId, share.OwnerId);
        return trip is null ? null : new SharedTripView(trip, share.Role);
    }

    public RedeemOutcome Redeem(string token, string callerOwnerId)
    {
        var share = FindActiveLink(token);
        if (share is null)
            return new RedeemOutcome(RedeemStatus.NotFound, Guid.Empty, TripMemberRole.Viewer);

        // The owner already has full access — redeeming is a no-op for them.
        if (share.OwnerId == callerOwnerId)
            return new RedeemOutcome(RedeemStatus.AlreadyOwner, share.TripId, TripMemberRole.Owner);

        var user = users.GetOrCreate(callerOwnerId);

        var member = db.TripMembers.SingleOrDefault(m => m.TripId == share.TripId && m.UserId == user.Id);
        var now = DateTimeOffset.UtcNow;
        if (member is null)
        {
            member = new TripMember
            {
                TripId = share.TripId,
                OwnerId = share.OwnerId,
                UserId = user.Id,
                Role = share.Role,
                CreatedAt = now,
                UpdatedAt = now,
            };
            db.TripMembers.Add(member);
        }
        else
        {
            // Revive a previously-removed membership and adopt the link's role.
            member.DeletedAt = null;
            member.Role = share.Role;
            member.UpdatedAt = now;
        }

        db.SaveChanges();
        return new RedeemOutcome(RedeemStatus.Redeemed, share.TripId, share.Role);
    }

    private TripShare? FindActiveLink(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
            return null;

        var now = DateTimeOffset.UtcNow;
        return db.TripShares.AsNoTracking()
            .FirstOrDefault(s =>
                s.Token == token &&
                s.Mode == TripShareMode.Link &&
                s.DeletedAt == null &&
                (s.ExpiresAt == null || s.ExpiresAt > now));
    }

    // URL-safe capability token; unguessable is the entire access control (matches recap shares).
    private static string NewToken() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(20));

    public static string ShareUrlForToken(string token) => $"/api/shared/trips/{token}";

    private static TripShareView ToView(TripShare s) =>
        new(s.Id, s.Role, s.Token ?? string.Empty, ShareUrlForToken(s.Token ?? string.Empty), s.ExpiresAt, s.CreatedAt);
}
