using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Security;
using Wander.Api.Weather;

namespace Wander.Api.Controllers;

[ApiController]
[Route("api/trips/{tripId:guid}/weather")]
[Authorize]
public class WeatherController(ITripRepository repo, IWeatherProvider weather) : ControllerBase
{
    /// <summary>
    /// GET /api/trips/{tripId}/weather
    ///
    /// Returns per-item and per-day weather for all located stops in the trip.
    /// Items without lat/lng are omitted (no coordinates → no weather).
    /// Day representative = weather from the day's first located item (by sort order).
    /// Provider key is never exposed; all values are in Celsius (client converts to °F).
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<TripWeatherResponse>> Get(
        Guid tripId, CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null) return Unauthorized();

        var trip = repo.GetById(tripId, ownerId);
        if (trip is null) return NotFound();

        var itemResults = new List<ItemWeatherResult>();
        var dayResults  = new List<DayWeatherResult>();

        // Process each day; fetch weather for located items in parallel batches.
        foreach (var day in trip.Days.Where(d => d.DeletedAt is null).OrderBy(d => d.DayNumber))
        {
            var located = day.Items
                .Where(i => i.DeletedAt is null && i.Latitude is not null && i.Longitude is not null)
                .OrderBy(i => i.StartTime)
                .ThenBy(i => i.SortOrder)
                .ToList();

            if (located.Count == 0) continue;

            // Fetch weather for each located item concurrently.
            var tasks = located.Select(item =>
                FetchSafe(item.Latitude!.Value, item.Longitude!.Value, day.Date, ct)
                    .ContinueWith(t => (item, obs: t.Result), ct));

            var fetched = await Task.WhenAll(tasks);

            foreach (var (item, obs) in fetched)
            {
                if (obs is null) continue;
                itemResults.Add(new ItemWeatherResult(
                    item.Id, obs.HighC, obs.LowC, obs.WeatherCode, obs.IsClimateSummary));
            }

            // Day representative = weather from the first located item with a result.
            var rep = fetched.FirstOrDefault(f => f.obs is not null);
            if (rep != default)
            {
                dayResults.Add(new DayWeatherResult(
                    day.Id, rep.obs!.HighC, rep.obs.LowC, rep.obs.WeatherCode, rep.obs.IsClimateSummary));
            }
        }

        return Ok(new TripWeatherResponse(itemResults, dayResults));
    }

    private async Task<WeatherObservation?> FetchSafe(
        double lat, double lng, DateOnly date, CancellationToken ct)
    {
        try { return await weather.GetWeatherAsync(lat, lng, date, ct); }
        catch { return null; }
    }
}

// ── Response DTOs ─────────────────────────────────────────────────────────────

public record TripWeatherResponse(
    IReadOnlyList<ItemWeatherResult> Items,
    IReadOnlyList<DayWeatherResult>  Days);

public record ItemWeatherResult(
    Guid ItemId,
    double HighC,
    double LowC,
    int WeatherCode,
    bool IsClimateSummary);

public record DayWeatherResult(
    Guid DayId,
    double HighC,
    double LowC,
    int WeatherCode,
    bool IsClimateSummary);
