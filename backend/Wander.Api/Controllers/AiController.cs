using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Ai;
using Wander.Api.Security;

namespace Wander.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AiController(
    IAiProvider ai,
    IAiTokenQuotaService quota,
    IAiItineraryDraftService drafts,
    IAiPlanningService planning,
    IAiUndoService undo) : ControllerBase
{
    /// <summary>
    /// GET /api/ai/status — whether AI is enabled for this deployment and the caller's quota headroom.
    /// </summary>
    [HttpGet("status")]
    public async Task<ActionResult<AiStatusResponse>> GetStatus(CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var snapshot = await quota.GetSnapshotAsync(ownerId, ct);
        return Ok(new AiStatusResponse(
            ai.IsEnabled,
            snapshot.DailyLimit,
            snapshot.UsedToday,
            snapshot.RemainingToday));
    }

    /// <summary>
    /// POST /api/ai/trips/{tripId}/generate-itinerary — ephemeral draft (not persisted until the client accepts).
    /// </summary>
    [HttpPost("trips/{tripId:guid}/generate-itinerary")]
    public async Task<ActionResult<GenerateItineraryResponse>> GenerateItinerary(
        Guid tripId,
        [FromBody] GenerateItineraryRequest request,
        CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        if (!ai.IsEnabled)
            return StatusCode(503, new { title = "AI is not configured on this server." });

        try
        {
            var result = await drafts.GenerateAsync(ownerId, tripId, request, ct);
            return Ok(result);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (AiQuotaExceededException)
        {
            return StatusCode(429, new { title = "Daily AI token quota exceeded." });
        }
        catch (AiDraftParseException ex)
        {
            return BadRequest(new { title = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { title = ex.Message });
        }
    }

    /// <summary>
    /// POST /api/ai/trips/{tripId}/chat — SSE stream of assistant text, tool activity, and trip mutations.
    /// </summary>
    [HttpPost("trips/{tripId:guid}/chat")]
    public async Task Chat(
        Guid tripId,
        [FromBody] AiChatRequest request,
        CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
        {
            Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        if (!ai.IsEnabled)
        {
            Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            return;
        }

        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.Connection = "keep-alive";
        Response.Headers.Append("X-Accel-Buffering", "no");

        await foreach (var evt in planning.StreamChatAsync(ownerId, tripId, request, ct))
        {
            var json = JsonSerializer.Serialize(evt, AiJson.CamelCase);
            await Response.WriteAsync($"event: {evt.Type}\n", ct);
            await Response.WriteAsync($"data: {json}\n\n", ct);
            await Response.Body.FlushAsync(ct);

            if (evt.Type == AiChatStreamEventTypes.Error)
                break;
        }
    }

    /// <summary>
    /// POST /api/ai/trips/{tripId}/undo — reverse a batch of AI mutations (steps applied in reverse order).
    /// </summary>
    [HttpPost("trips/{tripId:guid}/undo")]
    public ActionResult<UndoAiBatchResponse> UndoBatch(
        Guid tripId,
        [FromBody] UndoAiBatchRequest request,
        CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        if (request.Steps is null || request.Steps.Count == 0)
            return BadRequest(new { title = "At least one undo step is required." });

        try
        {
            var changes = undo.ApplyUndo(ownerId, tripId, request.Steps);
            return Ok(new UndoAiBatchResponse(changes));
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { title = ex.Message });
        }
    }
}
