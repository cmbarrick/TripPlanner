using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Ai;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Recaps;
using Wander.Api.Security;

namespace Wander.Api.Controllers;

[ApiController]
[Route("api/trips/{tripId:guid}/recaps")]
[Authorize]
public class RecapsController(
    IAiProvider ai,
    IRecapGenerationService generation,
    IRecapRepository recaps,
    IRecapExportService export,
    ITripRepository trips) : ControllerBase
{
    /// <summary>
    /// POST /api/trips/{tripId}/recaps/generate — AI-draft a recap from the scope's notes.
    /// Persists the draft (regeneration with unchanged notes returns the same draft).
    /// </summary>
    [HttpPost("generate")]
    public async Task<ActionResult<RecapDto>> Generate(
        Guid tripId,
        [FromBody] GenerateRecapRequest request,
        CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        if (!ai.IsEnabled)
            return StatusCode(503, new { title = "AI is not configured on this server." });

        try
        {
            var recap = await generation.GenerateAsync(ownerId, tripId, request, ct);
            return Ok(RecapMapper.ToDto(recap));
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (RecapNoSourceNotesException ex)
        {
            return BadRequest(new { title = ex.Message });
        }
        catch (AiQuotaExceededException)
        {
            return StatusCode(429, new { title = "Daily AI token quota exceeded." });
        }
        catch (RecapParseException ex)
        {
            return BadRequest(new { title = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { title = ex.Message });
        }
    }

    /// <summary>GET /api/trips/{tripId}/recaps — all recaps for a trip (newest first).</summary>
    [HttpGet]
    public ActionResult<IEnumerable<RecapDto>> List(Guid tripId)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        return Ok(recaps.GetForTrip(tripId, ownerId).Select(RecapMapper.ToDto));
    }

    /// <summary>GET /api/trips/{tripId}/recaps/{recapId}</summary>
    [HttpGet("{recapId:guid}")]
    public ActionResult<RecapDto> Get(Guid tripId, Guid recapId)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var recap = recaps.GetById(recapId, ownerId);
        if (recap is null || recap.TripId != tripId)
            return NotFound();

        return Ok(RecapMapper.ToDto(recap));
    }

    /// <summary>PUT /api/trips/{tripId}/recaps/{recapId} — save the user's edit (version bump).</summary>
    [HttpPut("{recapId:guid}")]
    public ActionResult<RecapDto> Update(Guid tripId, Guid recapId, [FromBody] UpdateRecapRequest request)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var title = request.Title?.Trim() ?? "";
        var body = request.Body?.Trim() ?? "";
        if (title.Length == 0 || title.Length > Recap.MaxTitleLength)
            return BadRequest(new { title = $"Title is required (max {Recap.MaxTitleLength} characters)." });
        if (body.Length == 0 || body.Length > Recap.MaxBodyLength)
            return BadRequest(new { title = $"Body is required (max {Recap.MaxBodyLength} characters)." });

        var recap = recaps.GetById(recapId, ownerId);
        if (recap is null || recap.TripId != tripId)
            return NotFound();

        return Ok(RecapMapper.ToDto(recaps.UpdateDraft(recapId, ownerId, title, body)!));
    }

    /// <summary>POST /api/trips/{tripId}/recaps/{recapId}/finalize — lock the story in.</summary>
    [HttpPost("{recapId:guid}/finalize")]
    public ActionResult<RecapDto> Finalize(Guid tripId, Guid recapId)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var recap = recaps.GetById(recapId, ownerId);
        if (recap is null || recap.TripId != tripId)
            return NotFound();

        return Ok(RecapMapper.ToDto(recaps.Finalize(recapId, ownerId)!));
    }

    /// <summary>POST /api/trips/{tripId}/recaps/{recapId}/share — issue (or reuse) the unlisted
    /// share-page link. Private capability URL only; public publishing is Phase 8.</summary>
    [HttpPost("{recapId:guid}/share")]
    public ActionResult<RecapDto> Share(Guid tripId, Guid recapId)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var recap = recaps.GetById(recapId, ownerId);
        if (recap is null || recap.TripId != tripId)
            return NotFound();

        return Ok(RecapMapper.ToDto(recaps.EnsureShareToken(recapId, ownerId, RecapMapper.ShareUrl)!));
    }

    /// <summary>GET /api/trips/{tripId}/recaps/{recapId}/pdf — server-rendered PDF export.</summary>
    [HttpGet("{recapId:guid}/pdf")]
    public async Task<IActionResult> Pdf(
        Guid tripId, Guid recapId, [FromQuery] bool includePhotos, CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var recap = recaps.GetById(recapId, ownerId);
        if (recap is null || recap.TripId != tripId)
            return NotFound();

        var trip = trips.GetById(tripId, ownerId);
        if (trip is null)
            return NotFound();

        var pdf = await export.RenderPdfAsync(recap, trip, includePhotos, ct);
        recaps.RecordExportUrl(recapId, ownerId, $"/api/trips/{tripId}/recaps/{recapId}/pdf");

        var fileName = string.Join("_", $"{trip.Title} recap".Split(Path.GetInvalidFileNameChars()));
        return File(pdf, "application/pdf", $"{fileName}.pdf");
    }

    /// <summary>DELETE /api/trips/{tripId}/recaps/{recapId}</summary>
    [HttpDelete("{recapId:guid}")]
    public IActionResult Delete(Guid tripId, Guid recapId)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var recap = recaps.GetById(recapId, ownerId);
        if (recap is null || recap.TripId != tripId)
            return NotFound();

        return recaps.Delete(recapId, ownerId) ? NoContent() : NotFound();
    }
}
