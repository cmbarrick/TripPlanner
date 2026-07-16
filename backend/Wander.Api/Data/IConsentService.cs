using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>
/// Sharing/publishing/AI consent (Phase 7 Slice 5; publish lifecycle extended in Phase 8 Slice 0).
/// Every flag defaults to <c>false</c> — consent is explicit opt-in. Turning
/// <see cref="ConsentSetting.ShareEnabled"/> off unshares immediately (active links + memberships
/// revoked); turning <see cref="ConsentSetting.PublishEnabled"/> off unpublishes immediately (every
/// public recap the owner holds is pulled from discovery) — both in the same update as the flag flip.
/// </summary>
public interface IConsentService
{
    Task<ConsentSetting> GetOrCreateAsync(string ownerId, CancellationToken ct = default);

    Task<ConsentSetting> UpdateAsync(string ownerId, ConsentUpdate update, CancellationToken ct = default);
}

/// <summary>Partial update — only non-null fields are applied.</summary>
public sealed record ConsentUpdate(
    bool? ShareEnabled = null,
    bool? PublishEnabled = null,
    bool? AiUseEnabled = null,
    bool? AiTrainingEnabled = null);

public class ConsentService(WanderDbContext db, IUserService users) : IConsentService
{
    public async Task<ConsentSetting> GetOrCreateAsync(string ownerId, CancellationToken ct = default)
    {
        var existing = await db.ConsentSettings
            .AsNoTracking()
            .SingleOrDefaultAsync(c => c.OwnerId == ownerId && c.DeletedAt == null, ct);
        if (existing is not null)
            return existing;

        var user = users.GetOrCreate(ownerId);

        var consent = new ConsentSetting
        {
            OwnerId = ownerId,
            UserId = user.Id,
        };
        db.ConsentSettings.Add(consent);
        await db.SaveChangesAsync(ct);
        return consent;
    }

    public async Task<ConsentSetting> UpdateAsync(string ownerId, ConsentUpdate update, CancellationToken ct = default)
    {
        var consent = await db.ConsentSettings
            .SingleOrDefaultAsync(c => c.OwnerId == ownerId && c.DeletedAt == null, ct);
        if (consent is null)
        {
            await GetOrCreateAsync(ownerId, ct);
            consent = await db.ConsentSettings
                .SingleAsync(c => c.OwnerId == ownerId && c.DeletedAt == null, ct);
        }

        var shareWasEnabled = consent.ShareEnabled;
        var publishWasEnabled = consent.PublishEnabled;

        if (update.ShareEnabled is { } share)
            consent.ShareEnabled = share;
        if (update.PublishEnabled is { } publish)
            consent.PublishEnabled = publish;
        if (update.AiUseEnabled is { } aiUse)
            consent.AiUseEnabled = aiUse;
        if (update.AiTrainingEnabled is { } aiTraining)
            consent.AiTrainingEnabled = aiTraining;

        consent.UpdatedAt = DateTimeOffset.UtcNow;

        // Revocation unshares immediately: dropping ShareEnabled kills every active link + membership
        // on trips this owner holds, not just future share attempts.
        if (shareWasEnabled && !consent.ShareEnabled)
            await RevokeAllSharesAsync(ownerId, consent.UpdatedAt, ct);

        // Same for publishing: dropping PublishEnabled pulls every public recap immediately.
        if (publishWasEnabled && !consent.PublishEnabled)
            await UnpublishAllAsync(ownerId, consent.UpdatedAt, ct);

        await db.SaveChangesAsync(ct);
        return consent;
    }

    private async Task RevokeAllSharesAsync(string ownerId, DateTimeOffset now, CancellationToken ct)
    {
        var shares = await db.TripShares
            .Where(s => s.OwnerId == ownerId && s.DeletedAt == null)
            .ToListAsync(ct);
        foreach (var share in shares)
        {
            share.DeletedAt = now;
            share.UpdatedAt = now;
        }

        var members = await db.TripMembers
            .Where(m => m.OwnerId == ownerId && m.DeletedAt == null)
            .ToListAsync(ct);
        foreach (var member in members)
        {
            member.DeletedAt = now;
            member.UpdatedAt = now;
        }
    }

    private async Task UnpublishAllAsync(string ownerId, DateTimeOffset now, CancellationToken ct)
    {
        var published = await db.PublicRecaps
            .Where(p => p.OwnerId == ownerId && p.DeletedAt == null)
            .ToListAsync(ct);
        foreach (var publicRecap in published)
        {
            publicRecap.DeletedAt = now;
            publicRecap.UpdatedAt = now;
        }
    }
}
