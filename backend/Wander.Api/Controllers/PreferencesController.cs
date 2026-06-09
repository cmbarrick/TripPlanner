using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Security;

namespace Wander.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PreferencesController(IPreferenceService preferences) : ControllerBase
{
    /// <summary>GET /api/preferences — caller's units and travel-planning preferences.</summary>
    [HttpGet]
    public async Task<ActionResult<PreferencesResponse>> Get(CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var pref = await preferences.GetOrCreateAsync(ownerId, ct);
        return Ok(ToResponse(pref));
    }

    /// <summary>PUT /api/preferences — partial update; omitted fields are left unchanged.</summary>
    [HttpPut]
    public async Task<ActionResult<PreferencesResponse>> Update(
        [FromBody] UpdatePreferencesRequest request,
        CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        try
        {
            var pref = await preferences.UpdateAsync(ownerId, request.ToUpdate(), ct);
            return Ok(ToResponse(pref));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { title = ex.Message });
        }
    }

    private static PreferencesResponse ToResponse(Preference pref) =>
        new(
            pref.TemperatureUnit,
            pref.DistanceUnit,
            pref.Currency,
            pref.TravelStyle,
            pref.Pace,
            pref.Diet,
            pref.BudgetBand);

    public sealed record PreferencesResponse(
        string TemperatureUnit,
        string DistanceUnit,
        string Currency,
        string? TravelStyle,
        string? Pace,
        string? Diet,
        string? BudgetBand);

    public sealed record UpdatePreferencesRequest(
        string? TemperatureUnit = null,
        string? DistanceUnit = null,
        string? Currency = null,
        string? TravelStyle = null,
        string? Pace = null,
        string? Diet = null,
        string? BudgetBand = null)
    {
        public PreferenceUpdate ToUpdate() =>
            new(
                TemperatureUnit,
                DistanceUnit,
                Currency,
                TravelStyle,
                Pace,
                Diet,
                BudgetBand);
    }
}
