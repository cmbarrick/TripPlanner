namespace Wander.Api.Ai;

public sealed record AiQuotaSnapshot(int DailyLimit, int UsedToday, int RemainingToday);

public interface IAiTokenQuotaService
{
    Task<AiQuotaSnapshot> GetSnapshotAsync(string ownerId, CancellationToken ct);

    /// <summary>
    /// Returns false when recording <paramref name="usage"/> would exceed the daily limit.
    /// On success, increments the persisted counter.
    /// </summary>
    Task<bool> TryRecordUsageAsync(string ownerId, AiUsage usage, CancellationToken ct);
}
