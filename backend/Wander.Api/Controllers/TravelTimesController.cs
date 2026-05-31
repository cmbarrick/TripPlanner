using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Security;
using Wander.Api.Routing;

namespace Wander.Api.Controllers;

[ApiController]
[Route("api/trips/{tripId:guid}/travel-times")]
[Authorize]
public class TravelTimesController(ITripRepository repo, IRoutingProvider routing) : ControllerBase
{
    /// <summary>
    /// GET /api/trips/{tripId}/travel-times
    ///
    /// Returns travel estimates between every consecutive pair of located, timed items
    /// within each day. Items without coordinates or start times are skipped.
    /// Estimates are straight-line (Haversine) by default; upgrade to real routing by
    /// configuring Routing:AzureMapsKey.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<TravelTimesResponse>> Get(Guid tripId, CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null) return Unauthorized();

        var trip = repo.GetById(tripId, ownerId);
        if (trip is null) return NotFound();

        var segments = new List<TravelSegment>();

        foreach (var day in trip.Days.Where(d => d.DeletedAt is null).OrderBy(d => d.DayNumber))
        {
            // Only timed, located items participate in travel-time calculation.
            var located = day.Items
                .Where(i => i.DeletedAt is null
                         && i.StartTime is not null
                         && i.Latitude is not null
                         && i.Longitude is not null)
                .OrderBy(i => i.StartTime)
                .ToList();

            for (var i = 0; i < located.Count - 1; i++)
            {
                var from = located[i];
                var to   = located[i + 1];

                var est = await FetchSafe(
                    from.Latitude!.Value, from.Longitude!.Value,
                    to.Latitude!.Value,   to.Longitude!.Value, ct);

                if (est is null) continue;

                segments.Add(new TravelSegment(
                    from.Id, to.Id,
                    est.DistanceKm, est.WalkingMinutes, est.DrivingMinutes));
            }
        }

        return Ok(new TravelTimesResponse(segments));
    }

    private async Task<TravelEstimate?> FetchSafe(
        double oLat, double oLng, double dLat, double dLng, CancellationToken ct)
    {
        try { return await routing.GetEstimateAsync(oLat, oLng, dLat, dLng, ct); }
        catch { return null; }
    }
}

public record TravelTimesResponse(IReadOnlyList<TravelSegment> Segments);

public record TravelSegment(
    Guid   FromItemId,
    Guid   ToItemId,
    double DistanceKm,
    int    WalkingMinutes,
    int    DrivingMinutes);
