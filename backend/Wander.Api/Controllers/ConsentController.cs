using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Security;

namespace Wander.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ConsentController(IConsentService consent) : ControllerBase
{
    /// <summary>GET /api/consent — caller's sharing/publishing/AI consent flags.</summary>
    [HttpGet]
    public async Task<ActionResult<ConsentResponse>> Get(CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var setting = await consent.GetOrCreateAsync(ownerId, ct);
        return Ok(ToResponse(setting));
    }

    /// <summary>
    /// PUT /api/consent — partial update; omitted fields are left unchanged. Turning
    /// <c>shareEnabled</c> off unshares immediately: active links and memberships are revoked.
    /// </summary>
    [HttpPut]
    public async Task<ActionResult<ConsentResponse>> Update(
        [FromBody] UpdateConsentRequest request,
        CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var setting = await consent.UpdateAsync(
            ownerId,
            new ConsentUpdate(request.ShareEnabled, request.PublishEnabled, request.AiUseEnabled, request.AiTrainingEnabled),
            ct);
        return Ok(ToResponse(setting));
    }

    private static ConsentResponse ToResponse(ConsentSetting c) =>
        new(c.ShareEnabled, c.PublishEnabled, c.AiUseEnabled, c.AiTrainingEnabled);

    public sealed record ConsentResponse(
        bool ShareEnabled,
        bool PublishEnabled,
        bool AiUseEnabled,
        bool AiTrainingEnabled);

    public sealed record UpdateConsentRequest(
        bool? ShareEnabled = null,
        bool? PublishEnabled = null,
        bool? AiUseEnabled = null,
        bool? AiTrainingEnabled = null);
}
