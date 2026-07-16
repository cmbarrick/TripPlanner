using System.Text.Json.Serialization;

namespace Wander.Api.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ReportStatus
{
    Open,
    Reviewed
}

/// <summary>
/// A user's report that a published recap should be reviewed (Phase 8, Slice 1). Filing a report
/// immediately flips the target <see cref="PublicRecap.ModerationStatus"/> back to
/// <see cref="ModerationStatus.Pending"/> — pulled from discovery until a moderator re-reviews it —
/// so a report has teeth without needing to wait for a queue sweep.
/// </summary>
public class PublicRecapReport
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid PublicRecapId { get; set; }

    public string ReporterOwnerId { get; set; } = string.Empty;

    public string Reason { get; set; } = string.Empty;

    public ReportStatus Status { get; set; } = ReportStatus.Open;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
