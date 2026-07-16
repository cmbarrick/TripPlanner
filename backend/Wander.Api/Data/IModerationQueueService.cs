using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

public enum ReportOutcomeStatus
{
    Reported,
    NotFound
}

public record ReportOutcome(ReportOutcomeStatus Status);

public record ModerationQueueItem(
    Guid PublicRecapId,
    Guid RecapId,
    Guid TripId,
    string OwnerId,
    ModerationStatus ModerationStatus,
    string? ModerationReason,
    int OpenReportCount,
    DateTimeOffset PublishedAt);

/// <summary>
/// User reporting + the human review queue for published recaps (Phase 8, Slice 1). Filing a report
/// immediately pulls the recap back to <see cref="ModerationStatus.Pending"/> (out of discovery)
/// until a moderator resolves it. Authorization (who may act on the queue) is the caller's
/// responsibility — see <c>ModerationController</c>'s admin-allowlist gate.
/// </summary>
public interface IModerationQueueService
{
    Task<ReportOutcome> ReportAsync(Guid publicRecapId, string reporterOwnerId, string reason, CancellationToken ct = default);

    /// <summary>Recaps needing review: pending moderation or carrying an open report.</summary>
    Task<IReadOnlyList<ModerationQueueItem>> GetQueueAsync(CancellationToken ct = default);

    Task<bool> ApproveAsync(Guid publicRecapId, CancellationToken ct = default);

    Task<bool> RejectAsync(Guid publicRecapId, string reason, CancellationToken ct = default);
}

public class ModerationQueueService(WanderDbContext db, ISearchIndexService searchIndex) : IModerationQueueService
{
    public async Task<ReportOutcome> ReportAsync(
        Guid publicRecapId, string reporterOwnerId, string reason, CancellationToken ct = default)
    {
        var recap = await db.PublicRecaps.SingleOrDefaultAsync(
            p => p.Id == publicRecapId && p.DeletedAt == null, ct);
        if (recap is null)
            return new ReportOutcome(ReportOutcomeStatus.NotFound);

        var now = DateTimeOffset.UtcNow;
        db.PublicRecapReports.Add(new PublicRecapReport
        {
            PublicRecapId = publicRecapId,
            ReporterOwnerId = reporterOwnerId,
            Reason = reason,
            CreatedAt = now,
            UpdatedAt = now,
        });

        // A report has teeth immediately — pull it from discovery pending re-review, rather than
        // waiting for a moderator to notice.
        recap.ModerationStatus = ModerationStatus.Pending;
        recap.ModerationReason = null;
        recap.UpdatedAt = now;

        await db.SaveChangesAsync(ct);
        await searchIndex.RemoveAsync(publicRecapId, ct);
        return new ReportOutcome(ReportOutcomeStatus.Reported);
    }

    public async Task<IReadOnlyList<ModerationQueueItem>> GetQueueAsync(CancellationToken ct = default)
    {
        var openReportCounts = await db.PublicRecapReports
            .Where(r => r.Status == ReportStatus.Open)
            .GroupBy(r => r.PublicRecapId)
            .Select(g => new { PublicRecapId = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var countByRecap = openReportCounts.ToDictionary(x => x.PublicRecapId, x => x.Count);

        var candidates = await db.PublicRecaps
            .AsNoTracking()
            .Where(p => p.DeletedAt == null &&
                (p.ModerationStatus == ModerationStatus.Pending || countByRecap.Keys.Contains(p.Id)))
            .OrderBy(p => p.PublishedAt)
            .ToListAsync(ct);

        return candidates
            .Select(p => new ModerationQueueItem(
                p.Id, p.RecapId, p.TripId, p.OwnerId, p.ModerationStatus, p.ModerationReason,
                countByRecap.GetValueOrDefault(p.Id), p.PublishedAt))
            .ToList();
    }

    public async Task<bool> ApproveAsync(Guid publicRecapId, CancellationToken ct = default)
    {
        var recap = await db.PublicRecaps.SingleOrDefaultAsync(
            p => p.Id == publicRecapId && p.DeletedAt == null, ct);
        if (recap is null)
            return false;

        recap.ModerationStatus = ModerationStatus.Approved;
        recap.ModerationReason = null;
        recap.UpdatedAt = DateTimeOffset.UtcNow;
        await ResolveOpenReportsAsync(publicRecapId, ct);
        await db.SaveChangesAsync(ct);
        await searchIndex.IndexAsync(publicRecapId, ct);
        return true;
    }

    public async Task<bool> RejectAsync(Guid publicRecapId, string reason, CancellationToken ct = default)
    {
        var recap = await db.PublicRecaps.SingleOrDefaultAsync(
            p => p.Id == publicRecapId && p.DeletedAt == null, ct);
        if (recap is null)
            return false;

        recap.ModerationStatus = ModerationStatus.Rejected;
        recap.ModerationReason = reason;
        recap.UpdatedAt = DateTimeOffset.UtcNow;
        await ResolveOpenReportsAsync(publicRecapId, ct);
        await db.SaveChangesAsync(ct);
        await searchIndex.RemoveAsync(publicRecapId, ct);
        return true;
    }

    private async Task ResolveOpenReportsAsync(Guid publicRecapId, CancellationToken ct)
    {
        var openReports = await db.PublicRecapReports
            .Where(r => r.PublicRecapId == publicRecapId && r.Status == ReportStatus.Open)
            .ToListAsync(ct);
        var now = DateTimeOffset.UtcNow;
        foreach (var report in openReports)
        {
            report.Status = ReportStatus.Reviewed;
            report.UpdatedAt = now;
        }
    }
}
