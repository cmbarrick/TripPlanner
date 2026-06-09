using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wander.Api.Data;
using Wander.Api.Models;

namespace Wander.Api.Ai;

public sealed class AiTokenQuotaService(WanderDbContext db, IOptions<AiOptions> options) : IAiTokenQuotaService
{
    private readonly AiOptions _options = options.Value;

    public async Task<AiQuotaSnapshot> GetSnapshotAsync(string ownerId, CancellationToken ct)
    {
        var today = TodayUtc();
        var row = await db.AiTokenUsages
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.OwnerId == ownerId && x.UsageDate == today, ct);

        var used = row?.TotalTokens ?? 0;
        var limit = _options.DailyTokenLimit;
        return new AiQuotaSnapshot(limit, used, Math.Max(0, limit - used));
    }

    public async Task<bool> TryRecordUsageAsync(string ownerId, AiUsage usage, CancellationToken ct)
    {
        if (usage.TotalTokens <= 0)
            return true;

        var today = TodayUtc();
        var limit = _options.DailyTokenLimit;

        var row = await db.AiTokenUsages
            .FirstOrDefaultAsync(x => x.OwnerId == ownerId && x.UsageDate == today, ct);

        if (row is null)
        {
            if (usage.TotalTokens > limit)
                return false;

            db.AiTokenUsages.Add(new AiTokenUsage
            {
                OwnerId = ownerId,
                UsageDate = today,
                PromptTokens = usage.PromptTokens,
                CompletionTokens = usage.CompletionTokens,
            });
        }
        else
        {
            if (row.TotalTokens + usage.TotalTokens > limit)
                return false;

            row.PromptTokens += usage.PromptTokens;
            row.CompletionTokens += usage.CompletionTokens;
            row.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        return true;
    }

    private static DateOnly TodayUtc() => DateOnly.FromDateTime(DateTime.UtcNow);
}
