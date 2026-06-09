using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Ai;
using Wander.Api.Security;

namespace Wander.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AiController(IAiProvider ai, IAiTokenQuotaService quota) : ControllerBase
{
    /// <summary>
    /// GET /api/ai/status — whether AI is enabled for this deployment and the caller's quota headroom.
    /// </summary>
    [HttpGet("status")]
    public async Task<ActionResult<AiStatusResponse>> GetStatus(CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var snapshot = await quota.GetSnapshotAsync(ownerId, ct);
        return Ok(new AiStatusResponse(
            ai.IsEnabled,
            snapshot.DailyLimit,
            snapshot.UsedToday,
            snapshot.RemainingToday));
    }
}
