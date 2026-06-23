using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Security;

namespace Wander.Api.Controllers;

/// <summary>
/// Owner-side management of a trip's account members (Phase 7, Slice 2): invite a registered user by
/// email, change a member's role, or remove them. Membership grants role-based access enforced by
/// <see cref="ITripAccessService"/> across the trip endpoints.
/// </summary>
[ApiController]
[Route("api/trips/{tripId:guid}/members")]
[Authorize]
public class TripMembersController(ITripAccessService access, ITripMemberService members) : ControllerBase
{
    [HttpGet]
    public ActionResult<IEnumerable<TripMemberView>> List(Guid tripId)
    {
        var (_, error) = RequireManage(tripId);
        return error ?? Ok(members.ListMembers(tripId));
    }

    [HttpPost]
    public ActionResult<TripMemberView> Invite(Guid tripId, [FromBody] InviteMemberRequest request)
    {
        var (resolved, error) = RequireManage(tripId);
        if (error is not null)
            return error;

        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest("Email is required.");

        if (request.Role is not (TripMemberRole.Viewer or TripMemberRole.Editor))
            return BadRequest("Member role must be 'Viewer' or 'Editor'.");

        var outcome = members.InviteByEmail(tripId, resolved!.TripOwnerId, request.Email, request.Role);
        return outcome.Status switch
        {
            InviteStatus.Invited => Ok(outcome.Member),
            InviteStatus.AlreadyOwner => BadRequest("That user already owns this trip."),
            // No pending-invite flow yet: the invitee must have an account.
            _ => NotFound("No registered user with that email."),
        };
    }

    [HttpPut("{memberId:guid}")]
    public IActionResult ChangeRole(Guid tripId, Guid memberId, [FromBody] ChangeMemberRoleRequest request)
    {
        var (_, error) = RequireManage(tripId);
        if (error is not null)
            return error;

        if (request.Role is not (TripMemberRole.Viewer or TripMemberRole.Editor))
            return BadRequest("Member role must be 'Viewer' or 'Editor'.");

        return members.ChangeRole(tripId, memberId, request.Role) ? NoContent() : NotFound();
    }

    [HttpDelete("{memberId:guid}")]
    public IActionResult Remove(Guid tripId, Guid memberId)
    {
        var (_, error) = RequireManage(tripId);
        if (error is not null)
            return error;

        return members.RemoveMember(tripId, memberId) ? NoContent() : NotFound();
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

public record InviteMemberRequest(string Email, TripMemberRole Role = TripMemberRole.Viewer);

public record ChangeMemberRoleRequest(TripMemberRole Role);
