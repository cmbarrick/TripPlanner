using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>Outcome of a content-safety review.</summary>
public record ModerationResult(ModerationStatus Status, string? Reason);

/// <summary>
/// Content-safety review gate for public recaps (Phase 8, Slice 0 seam; real Azure AI Content
/// Safety integration lands in the moderation slice). Reviews synchronously today; the interface
/// stays async so a real provider can call out to a service without changing callers.
/// </summary>
public interface IContentModerationService
{
    Task<ModerationResult> ReviewAsync(string title, string body, CancellationToken ct = default);
}

/// <summary>
/// Deterministic stand-in used until Azure AI Content Safety is wired up (dev/CI default, same
/// fake-provider convention as <c>FakeWeatherProvider</c>/<c>FakePlaceProvider</c>). Approves
/// everything except a fixed test marker, so rejection paths are exercisable without a real
/// moderation call.
/// </summary>
public class FakeContentModerationService : IContentModerationService
{
    public const string UnsafeMarker = "unsafe-test-content";

    public Task<ModerationResult> ReviewAsync(string title, string body, CancellationToken ct = default)
    {
        var flagged = title.Contains(UnsafeMarker, StringComparison.OrdinalIgnoreCase)
            || body.Contains(UnsafeMarker, StringComparison.OrdinalIgnoreCase);

        var result = flagged
            ? new ModerationResult(ModerationStatus.Rejected, "Flagged by content safety review.")
            : new ModerationResult(ModerationStatus.Approved, null);
        return Task.FromResult(result);
    }
}
