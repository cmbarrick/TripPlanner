using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Security;

namespace Wander.Api.Controllers;

/// <summary>
/// Link-token consumption for shared trips (Phase 7, Slice 1). The unguessable token is the access
/// control: a viewer can read the trip without an account; an authenticated caller can redeem the
/// link into a real <see cref="TripMember"/> so normal role-based access applies afterward.
/// </summary>
[ApiController]
[Route("api/shared/trips")]
public class SharedTripsController(ITripShareService shares) : ControllerBase
{
    /// <summary>GET /api/shared/trips/{token} — read a trip via a link, no account required.</summary>
    [HttpGet("{token}")]
    [AllowAnonymous]
    public ActionResult<SharedTripResponse> Get(string token)
    {
        var shared = shares.GetSharedTrip(token);
        return shared is null
            ? NotFound()
            : Ok(new SharedTripResponse(shared.Trip, shared.Role.ToString()));
    }

    /// <summary>POST /api/shared/trips/{token}/redeem — claim a link as the signed-in user.</summary>
    [HttpPost("{token}/redeem")]
    [Authorize]
    public ActionResult<RedeemResponse> Redeem(string token)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var outcome = shares.Redeem(token, ownerId);
        return outcome.Status == RedeemStatus.NotFound
            ? NotFound()
            : Ok(new RedeemResponse(outcome.TripId, outcome.Role.ToString(), outcome.Status.ToString()));
    }
}

public record SharedTripResponse(Trip Trip, string Role);

public record RedeemResponse(Guid TripId, string Role, string Status);
