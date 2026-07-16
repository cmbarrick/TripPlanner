using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Realtime;
using Wander.Api.Security;

namespace Wander.Api.Controllers;

/// <summary>
/// Emoji reactions on a trip, its events, or its recaps (Phase 7, Slice 4). Any trip member
/// (viewer included) can react; toggling the same emoji again removes it. Changes broadcast live.
/// </summary>
[ApiController]
[Route("api/trips/{tripId:guid}/reactions")]
[Authorize]
public class ReactionsController(
    ITripAccessService access,
    IReactionService reactions,
    ITripRealtimeNotifier realtime) : ControllerBase
{
    [HttpGet]
    public ActionResult<IEnumerable<ReactionView>> List(Guid tripId)
    {
        var (_, error) = RequireView(tripId);
        return error ?? Ok(reactions.ListForTrip(tripId));
    }

    [HttpPost]
    public ActionResult<ToggleReactionResult> Toggle(Guid tripId, [FromBody] ToggleReactionRequest request)
    {
        var (_, error) = RequireView(tripId);
        if (error is not null)
            return error;

        var emoji = request.Emoji?.Trim();
        if (string.IsNullOrEmpty(emoji) || emoji.Length > Reaction.MaxEmojiLength)
            return BadRequest("Emoji is required and must be short.");

        var ownerId = User.GetUserId()!;
        var result = reactions.Toggle(tripId, ownerId, request.TargetType, request.TargetId, emoji);
        realtime.NotifyTripChanged(tripId, "reactions", ownerId);
        return Ok(result);
    }

    private (TripAccess? access, ActionResult? error) RequireView(Guid tripId)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return (null, Unauthorized());

        var resolved = access.Resolve(tripId, ownerId);
        return resolved is null ? (null, NotFound()) : (resolved, null);
    }
}

public record ToggleReactionRequest(ReactionTargetType TargetType, Guid TargetId, string Emoji);
