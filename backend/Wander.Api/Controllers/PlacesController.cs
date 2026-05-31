using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Places;

namespace Wander.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PlacesController(IPlaceProvider places) : ControllerBase
{
    private const int MaxResults = 8;

    /// <summary>
    /// GET /api/places/autocomplete?q=Eiffel+Tower[&limit=5]
    /// Returns place candidates. The provider key never appears in the response.
    /// </summary>
    [HttpGet("autocomplete")]
    public async Task<ActionResult<IReadOnlyList<AutocompleteResult>>> Autocomplete(
        [FromQuery] string q,
        [FromQuery] int limit = 5,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest("q is required.");

        limit = Math.Clamp(limit, 1, MaxResults);

        IReadOnlyList<PlaceCandidate> candidates;
        try
        {
            candidates = await places.SearchAsync(q.Trim(), limit, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return StatusCode(503, new { error = "Place search is temporarily unavailable." });
        }

        return Ok(candidates.Select(c => new AutocompleteResult(c.PlaceId, c.Name, c.Address, c.Latitude, c.Longitude)));
    }

    /// <summary>
    /// GET /api/places/{id}
    /// Returns full structured details for a place. The provider key never appears in the response.
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<PlaceDetailsResult>> Details(string id, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(id))
            return BadRequest("id is required.");

        PlaceDetails? detail;
        try
        {
            detail = await places.GetDetailsAsync(id, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return StatusCode(503, new { error = "Place details are temporarily unavailable." });
        }

        return detail is null
            ? NotFound()
            : Ok(new PlaceDetailsResult(detail.PlaceId, detail.Name, detail.Address, detail.Latitude, detail.Longitude));
    }
}

// Separate DTO types so internal provider models are never accidentally serialized
// (would risk surfacing fields we don't intend to expose, including future ones).
public record AutocompleteResult(string PlaceId, string Name, string? Address, double? Latitude, double? Longitude);
public record PlaceDetailsResult(string PlaceId, string Name, string? Address, double Latitude, double Longitude);
