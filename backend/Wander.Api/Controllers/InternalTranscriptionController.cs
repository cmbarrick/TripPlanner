using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Models;

namespace Wander.Api.Controllers;

/// <summary>
/// Service-to-service callback used by the transcription Azure Function to write a transcript back
/// onto an audio <see cref="MediaAsset"/>. Not user-authenticated — authorized by a shared key
/// (<c>Functions:CallbackKey</c>) in the <c>X-Functions-Callback-Key</c> header. When the key is
/// not configured (local/CI) the endpoint rejects every request.
/// </summary>
[ApiController]
[Route("internal")]
[AllowAnonymous]
public class InternalTranscriptionController : ControllerBase
{
    public const string CallbackHeader = "X-Functions-Callback-Key";

    private readonly INoteRepository _notes;
    private readonly IConfiguration _config;

    public InternalTranscriptionController(INoteRepository notes, IConfiguration config)
    {
        _notes = notes;
        _config = config;
    }

    [HttpPost("media-assets/{mediaAssetId:guid}/transcript")]
    public IActionResult SetTranscript(Guid mediaAssetId, [FromBody] TranscriptCallbackRequest request)
    {
        var expected = _config["Functions:CallbackKey"];
        if (string.IsNullOrEmpty(expected)
            || !Request.Headers.TryGetValue(CallbackHeader, out var provided)
            || !CryptographicEquals(provided.ToString(), expected))
        {
            return Unauthorized();
        }

        var status = request.Success ? TranscriptionStatus.Completed : TranscriptionStatus.Failed;
        return _notes.SetTranscript(mediaAssetId, request.Transcript ?? string.Empty, status)
            ? NoContent()
            : NotFound();
    }

    private static bool CryptographicEquals(string a, string b)
    {
        if (a.Length != b.Length)
            return false;
        var result = 0;
        for (var i = 0; i < a.Length; i++)
            result |= a[i] ^ b[i];
        return result == 0;
    }
}

public record TranscriptCallbackRequest(string? Transcript, bool Success);
