using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Recaps;

namespace Wander.Api.Controllers;

/// <summary>
/// Anonymous, unlisted recap share pages (Phase 6). The unguessable token *is* the access
/// control — there is no listing, search, or index (robots are told noindex). Public,
/// searchable publishing with consent + moderation is Phase 8.
/// </summary>
[ApiController]
[Route("share/recaps")]
public class RecapShareController(
    IRecapRepository recaps,
    ITripRepository trips,
    IRecapExportService export) : ControllerBase
{
    /// <summary>GET /share/recaps/{token} — standalone HTML page for a shared recap.</summary>
    [HttpGet("{token}")]
    [AllowAnonymous]
    public IActionResult Get(string token)
    {
        var recap = recaps.GetByShareToken(token);
        if (recap is null)
            return NotFound();

        // Owner lookup through the recap's own OwnerId — the token grants read access.
        var trip = trips.GetById(recap.TripId, recap.OwnerId);
        if (trip is null)
            return NotFound();

        return Content(export.RenderHtml(recap, trip), "text/html; charset=utf-8");
    }
}
