using System.Security.Cryptography;
using Wander.Api.Models;

namespace Wander.Api.Data;

public class EfCoreRecapRepository : IRecapRepository
{
    private readonly WanderDbContext _ctx;

    public EfCoreRecapRepository(WanderDbContext ctx) => _ctx = ctx;

    private bool OwnsTrip(Guid tripId, string ownerId) =>
        _ctx.Trips.Any(t => t.Id == tripId && t.OwnerId == ownerId);

    public IEnumerable<Recap> GetForTrip(Guid tripId, string ownerId)
    {
        if (!OwnsTrip(tripId, ownerId))
            return [];

        return _ctx.Recaps
            .Where(r => r.TripId == tripId && r.OwnerId == ownerId && r.DeletedAt == null)
            .OrderByDescending(r => r.CreatedAt)
            .ToList();
    }

    public Recap? GetById(Guid recapId, string ownerId) =>
        _ctx.Recaps.FirstOrDefault(r => r.Id == recapId && r.OwnerId == ownerId && r.DeletedAt == null);

    public Recap? GetByShareToken(string shareToken) =>
        string.IsNullOrWhiteSpace(shareToken)
            ? null
            : _ctx.Recaps.FirstOrDefault(r => r.ShareToken == shareToken && r.DeletedAt == null);

    public Recap? Add(Guid tripId, string ownerId, Recap recap)
    {
        if (!OwnsTrip(tripId, ownerId))
            return null;

        var now = DateTimeOffset.UtcNow;
        recap.TripId = tripId;
        recap.OwnerId = ownerId;
        recap.CreatedAt = now;
        recap.UpdatedAt = now;

        _ctx.Recaps.Add(recap);
        _ctx.SaveChanges();
        return recap;
    }

    public Recap? UpdateDraft(Guid recapId, string ownerId, string title, string body)
    {
        var recap = GetById(recapId, ownerId);
        if (recap is null)
            return null;

        recap.Title = title;
        recap.Body = body;
        recap.Version += 1;
        recap.UpdatedAt = DateTimeOffset.UtcNow;
        _ctx.SaveChanges();
        return recap;
    }

    public Recap? Finalize(Guid recapId, string ownerId)
    {
        var recap = GetById(recapId, ownerId);
        if (recap is null)
            return null;

        recap.Status = RecapStatus.Final;
        recap.UpdatedAt = DateTimeOffset.UtcNow;
        _ctx.SaveChanges();
        return recap;
    }

    public Recap? EnsureShareToken(Guid recapId, string ownerId, Func<string, string> exportUrlForToken)
    {
        var recap = GetById(recapId, ownerId);
        if (recap is null)
            return null;

        if (string.IsNullOrEmpty(recap.ShareToken))
        {
            // URL-safe capability token; unguessable is the entire access control for unlisted pages.
            recap.ShareToken = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(20));
        }

        var url = exportUrlForToken(recap.ShareToken);
        if (!recap.ExportUrls.Contains(url))
        {
            // Reassign so EF change tracking sees a new list value (primitive collection).
            recap.ExportUrls = [.. recap.ExportUrls, url];
        }

        recap.UpdatedAt = DateTimeOffset.UtcNow;
        _ctx.SaveChanges();
        return recap;
    }

    public Recap? RecordExportUrl(Guid recapId, string ownerId, string url)
    {
        var recap = GetById(recapId, ownerId);
        if (recap is null)
            return null;

        if (!recap.ExportUrls.Contains(url))
        {
            recap.ExportUrls = [.. recap.ExportUrls, url];
            recap.UpdatedAt = DateTimeOffset.UtcNow;
            _ctx.SaveChanges();
        }

        return recap;
    }

    public bool Delete(Guid recapId, string ownerId)
    {
        var recap = GetById(recapId, ownerId);
        if (recap is null)
            return false;

        recap.DeletedAt = DateTimeOffset.UtcNow;
        _ctx.SaveChanges();
        return true;
    }
}
