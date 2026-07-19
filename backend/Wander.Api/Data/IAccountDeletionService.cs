using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>
/// Full account deletion (Apple Guideline 5.1.1(v) / Google Play equivalent — an app that lets
/// users create an account must let them delete it, in-app). Soft-deletes every row the caller
/// owns or is a member of, then anonymizes the <see cref="User"/> row itself so the underlying
/// auth identity (email/subject) is free for the same person to sign up again later.
///
/// Scope: everything reachable by <c>OwnerId</c> (Trips incl. their Days/Items/PackingItems,
/// Notes incl. MediaAssets, Recaps, PublicRecaps, Reactions, TripShares) plus every
/// <see cref="TripMember"/> row referencing this user (both trips they created and their
/// membership on others' trips), <see cref="Preference"/>, and <see cref="ConsentSetting"/>.
/// Deliberately out of scope for this pass: <see cref="AiTokenUsage"/> (aggregate quota counters,
/// no content) and <see cref="PublicRecapReport"/> (moderation reports the user filed against
/// others' content — leaving them preserves the moderation trail). Media bytes in blob storage are
/// not deleted here (no delete method on <see cref="Media.IBlobStore"/> yet) — only the DB row
/// tracking them; a follow-up can wire actual blob cleanup once that's worth the storage cost.
/// </summary>
public interface IAccountDeletionService
{
    /// <summary>Deletes everything owned by <paramref name="ownerId"/>. Returns <c>false</c> if no
    /// account exists for that identity (already deleted, or never created).</summary>
    Task<bool> DeleteAccountAsync(string ownerId, CancellationToken ct = default);
}

public class AccountDeletionService(WanderDbContext db) : IAccountDeletionService
{
    public async Task<bool> DeleteAccountAsync(string ownerId, CancellationToken ct = default)
    {
        // The Users row is created lazily (first touch of preferences/consent/sharing) — a caller
        // who has only ever created trips may own real data with no Users row yet. Deletion must not
        // depend on that row existing; it sweeps every owned entity regardless, and reports success
        // if there was a Users row OR any owned data to delete (a genuinely unknown identity with
        // nothing at all is the only case that reports "not found").
        var user = await db.Users.SingleOrDefaultAsync(u => u.OwnerId == ownerId && u.DeletedAt == null, ct);
        var now = DateTimeOffset.UtcNow;
        var deletedAnything = user is not null;

        var trips = await db.Trips.Where(x => x.OwnerId == ownerId && x.DeletedAt == null).ToListAsync(ct);
        foreach (var trip in trips) { trip.DeletedAt = now; trip.UpdatedAt = now; }
        deletedAnything |= trips.Count > 0;

        var days = await db.Days.Where(x => x.OwnerId == ownerId && x.DeletedAt == null).ToListAsync(ct);
        foreach (var day in days) { day.DeletedAt = now; day.UpdatedAt = now; }
        deletedAnything |= days.Count > 0;

        var items = await db.ItineraryItems.Where(x => x.OwnerId == ownerId && x.DeletedAt == null).ToListAsync(ct);
        foreach (var item in items) { item.DeletedAt = now; item.UpdatedAt = now; }
        deletedAnything |= items.Count > 0;

        var packingItems = await db.PackingItems.Where(x => x.OwnerId == ownerId && x.DeletedAt == null).ToListAsync(ct);
        foreach (var packing in packingItems) { packing.DeletedAt = now; packing.UpdatedAt = now; }
        deletedAnything |= packingItems.Count > 0;

        var notes = await db.Notes.Where(x => x.OwnerId == ownerId && x.DeletedAt == null).ToListAsync(ct);
        foreach (var note in notes) { note.DeletedAt = now; note.UpdatedAt = now; }
        deletedAnything |= notes.Count > 0;

        var media = await db.MediaAssets.Where(x => x.OwnerId == ownerId && x.DeletedAt == null).ToListAsync(ct);
        foreach (var asset in media) { asset.DeletedAt = now; asset.UpdatedAt = now; }
        deletedAnything |= media.Count > 0;

        var recaps = await db.Recaps.Where(x => x.OwnerId == ownerId && x.DeletedAt == null).ToListAsync(ct);
        foreach (var recap in recaps) { recap.DeletedAt = now; recap.UpdatedAt = now; }
        deletedAnything |= recaps.Count > 0;

        var publicRecaps = await db.PublicRecaps.Where(x => x.OwnerId == ownerId && x.DeletedAt == null).ToListAsync(ct);
        foreach (var published in publicRecaps) { published.DeletedAt = now; published.UpdatedAt = now; }
        deletedAnything |= publicRecaps.Count > 0;

        var reactions = await db.Reactions.Where(x => x.OwnerId == ownerId && x.DeletedAt == null).ToListAsync(ct);
        foreach (var reaction in reactions) { reaction.DeletedAt = now; reaction.UpdatedAt = now; }
        deletedAnything |= reactions.Count > 0;

        var shares = await db.TripShares.Where(x => x.OwnerId == ownerId && x.DeletedAt == null).ToListAsync(ct);
        foreach (var share in shares) { share.DeletedAt = now; share.UpdatedAt = now; }
        deletedAnything |= shares.Count > 0;

        // TripMember has two identity axes: OwnerId (who created the membership row — the trip
        // owner) and UserId (who the membership is about). Deleting an account must clear both —
        // trips this user shared out, and this user's own membership on other people's trips (the
        // latter only applies if a Users row exists, since membership keys off Users.Id).
        var userIdOrEmpty = user?.Id ?? Guid.Empty;
        var members = await db.TripMembers
            .Where(x => (x.OwnerId == ownerId || x.UserId == userIdOrEmpty) && x.DeletedAt == null)
            .ToListAsync(ct);
        foreach (var member in members) { member.DeletedAt = now; member.UpdatedAt = now; }
        deletedAnything |= members.Count > 0;

        if (user is not null)
        {
            var prefs = await db.Preferences.Where(x => x.UserId == user.Id && x.DeletedAt == null).ToListAsync(ct);
            foreach (var pref in prefs) { pref.DeletedAt = now; pref.UpdatedAt = now; }
            deletedAnything |= prefs.Count > 0;

            var consents = await db.ConsentSettings.Where(x => x.UserId == user.Id && x.DeletedAt == null).ToListAsync(ct);
            foreach (var consent in consents) { consent.DeletedAt = now; consent.UpdatedAt = now; }
            deletedAnything |= consents.Count > 0;

            // Anonymize last: OwnerId/SubjectId/Email are unique-indexed, so the same real-world
            // identity (Apple/Entra subject) can sign up again later — a soft-deleted row with the
            // original values would permanently block re-registration.
            user.DeletedAt = now;
            user.UpdatedAt = now;
            user.OwnerId = $"deleted:{Guid.NewGuid()}";
            user.SubjectId = $"deleted:{Guid.NewGuid()}";
            user.Email = $"deleted-{Guid.NewGuid()}@deleted.wander.invalid";
            user.DisplayName = "Deleted User";
        }

        if (!deletedAnything)
            return false;

        await db.SaveChangesAsync(ct);
        return true;
    }
}
