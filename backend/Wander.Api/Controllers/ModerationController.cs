using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Security;

namespace Wander.Api.Controllers;

/// <summary>
/// User reporting + the human moderation review queue for published recaps (Phase 8, Slice 1).
/// Reporting is open to any authenticated user; the queue and its actions are gated by a config
/// admin allowlist (<c>Moderation:AdminOwnerIds</c>) — there's no broader RBAC system yet, so this
/// is the minimal gate until one exists.
/// </summary>
[ApiController]
[Route("api/moderation")]
[Authorize]
public class ModerationController(IModerationQueueService moderation, IConfiguration config) : ControllerBase
{
    [HttpPost("reports")]
    public async Task<IActionResult> Report([FromBody] ReportRequest request, CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        if (string.IsNullOrWhiteSpace(request.Reason))
            return BadRequest(new { title = "A reason is required." });

        var outcome = await moderation.ReportAsync(request.PublicRecapId, ownerId, request.Reason.Trim(), ct);
        return outcome.Status == ReportOutcomeStatus.Reported ? NoContent() : NotFound();
    }

    [HttpGet("queue")]
    public async Task<ActionResult<IEnumerable<ModerationQueueItem>>> Queue(CancellationToken ct)
    {
        var (_, error) = RequireAdmin();
        return error ?? Ok(await moderation.GetQueueAsync(ct));
    }

    [HttpPost("queue/{publicRecapId:guid}/approve")]
    public async Task<IActionResult> Approve(Guid publicRecapId, CancellationToken ct)
    {
        var (_, error) = RequireAdmin();
        if (error is not null)
            return error;

        return await moderation.ApproveAsync(publicRecapId, ct) ? NoContent() : NotFound();
    }

    [HttpPost("queue/{publicRecapId:guid}/reject")]
    public async Task<IActionResult> Reject(Guid publicRecapId, [FromBody] RejectRequest request, CancellationToken ct)
    {
        var (_, error) = RequireAdmin();
        if (error is not null)
            return error;

        if (string.IsNullOrWhiteSpace(request.Reason))
            return BadRequest(new { title = "A reason is required." });

        return await moderation.RejectAsync(publicRecapId, request.Reason.Trim(), ct) ? NoContent() : NotFound();
    }

    private (string? ownerId, ActionResult? error) RequireAdmin()
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return (null, Unauthorized());

        var admins = config.GetSection("Moderation:AdminOwnerIds").Get<string[]>() ?? [];
        return admins.Contains(ownerId) ? (ownerId, null) : (null, Forbid());
    }
}

public record ReportRequest(Guid PublicRecapId, string Reason);

public record RejectRequest(string Reason);
