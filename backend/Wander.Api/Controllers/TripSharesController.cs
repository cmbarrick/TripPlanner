using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Security;

namespace Wander.Api.Controllers;

/// <summary>
/// Owner-side management of a trip's share links (Phase 7, Slice 1). Issuing/revoking links is an
/// owner-only capability; viewing a shared trip happens anonymously via <see cref="SharedTripsController"/>.
/// </summary>
[ApiController]
[Route("api/trips/{tripId:guid}/shares")]
[Authorize]
public class TripSharesController(ITripAccessService access, ITripShareService shares, IConsentService consent) : ControllerBase
{
    [HttpGet]
    public ActionResult<IEnumerable<TripShareView>> List(Guid tripId)
    {
        var (_, error) = RequireManage(tripId);
        return error ?? Ok(shares.ListLinks(tripId));
    }

    [HttpPost]
    public async Task<ActionResult<TripShareView>> Create(Guid tripId, [FromBody] CreateShareRequest request, CancellationToken ct)
    {
        var (resolved, error) = RequireManage(tripId);
        if (error is not null)
            return error;

        var setting = await consent.GetOrCreateAsync(resolved!.TripOwnerId, ct);
        if (!setting.ShareEnabled)
            return StatusCode(403, new { title = "Sharing is disabled. Enable sharing in your privacy settings first." });

        // A link can only confer viewer/editor access — never owner.
        if (request.Role is not (TripMemberRole.Viewer or TripMemberRole.Editor))
            return BadRequest("Share role must be 'Viewer' or 'Editor'.");

        if (request.ExpiresAt is { } expiry && expiry <= DateTimeOffset.UtcNow)
            return BadRequest("Expiry must be in the future.");

        var link = shares.CreateLink(tripId, resolved!.TripOwnerId, request.Role, request.ExpiresAt);
        return Ok(link);
    }

    [HttpDelete("{shareId:guid}")]
    public IActionResult Revoke(Guid tripId, Guid shareId)
    {
        var (_, error) = RequireManage(tripId);
        if (error is not null)
            return error;

        return shares.RevokeLink(tripId, shareId) ? NoContent() : NotFound();
    }

    private (TripAccess? access, ActionResult? error) RequireManage(Guid tripId)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return (null, Unauthorized());

        var resolved = access.Resolve(tripId, ownerId);
        if (resolved is null)
            return (null, NotFound());

        return resolved.CanManage ? (resolved, null) : (null, Forbid());
    }
}

public record CreateShareRequest(TripMemberRole Role = TripMemberRole.Viewer, DateTimeOffset? ExpiresAt = null);
