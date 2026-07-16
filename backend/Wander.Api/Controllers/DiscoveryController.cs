using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Ai;
using Wander.Api.Data;
using Wander.Api.Discovery;
using Wander.Api.Security;

namespace Wander.Api.Controllers;

/// <summary>
/// Discovery over consented, approved public recaps (Phase 8). Search is anonymous — reachable
/// without an account, same posture as the anonymous share-link/recap-page reads elsewhere in the
/// app. Asking the RAG assistant requires auth: it spends the caller's shared daily AI token
/// quota, same as chat/recap generation.
/// </summary>
[ApiController]
[Route("api/discovery")]
public class DiscoveryController(ISearchService search, IDiscoveryAssistantService assistant) : ControllerBase
{
    /// <summary>
    /// GET /api/discovery/search?q=&amp;place=&amp;tag=&amp;season=&amp;budgetBand=&amp;take= —
    /// facet filters always apply; <c>q</c> ranks by semantic similarity (falls back to keyword
    /// match for any not-yet-indexed recap).
    /// </summary>
    [HttpGet("search")]
    [AllowAnonymous]
    public async Task<ActionResult<IEnumerable<SearchResultDto>>> Search(
        [FromQuery] string? q,
        [FromQuery] string? place,
        [FromQuery] string? tag,
        [FromQuery] string? season,
        [FromQuery] string? budgetBand,
        [FromQuery] int take,
        CancellationToken ct)
    {
        var results = await search.SearchAsync(new SearchQuery(q, place, tag, season, budgetBand, take), ct);
        return Ok(results);
    }

    /// <summary>
    /// POST /api/discovery/ask — grounded Q&amp;A over public recaps, with citations. Returns
    /// <c>hasAnswer: false</c> (not an error) when nothing in the corpus actually answers the
    /// question, rather than guessing.
    /// </summary>
    [HttpPost("ask")]
    [Authorize]
    public async Task<ActionResult<AskDiscoveryResponse>> Ask([FromBody] AskDiscoveryRequest request, CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        try
        {
            var answer = await assistant.AskAsync(ownerId, request.Question, ct);
            return Ok(ToResponse(answer));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { title = ex.Message });
        }
        catch (InvalidOperationException)
        {
            return StatusCode(503, new { title = "AI is not configured on this server." });
        }
        catch (AiQuotaExceededException)
        {
            return StatusCode(429, new { title = "Daily AI token quota exceeded." });
        }
        catch (DiscoveryParseException ex)
        {
            return BadRequest(new { title = ex.Message });
        }
    }

    private static AskDiscoveryResponse ToResponse(DiscoveryAnswer answer) => new(
        answer.Status == DiscoveryAnswerStatus.Answered,
        answer.Answer,
        answer.Citations.Select(c => new DiscoveryCitationDto(c.PublicRecapId, c.RecapId, c.TripId, c.Title, c.Places)).ToList());
}

public record AskDiscoveryRequest(string Question);

public record DiscoveryCitationDto(Guid PublicRecapId, Guid RecapId, Guid TripId, string Title, IReadOnlyList<string> Places);

public record AskDiscoveryResponse(bool HasAnswer, string? Answer, IReadOnlyList<DiscoveryCitationDto> Citations);
