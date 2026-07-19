using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Security;

namespace Wander.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController(IAccountDeletionService accountDeletion) : ControllerBase
{
    /// <summary>
    /// DELETE /api/users/me — permanently deletes the caller's account and everything they own
    /// (trips, notes, recaps, reactions, shares/memberships). Apple/Google store-review requirement
    /// for any app offering account creation. Irreversible from the client's perspective; signs the
    /// caller out client-side after this returns.
    /// </summary>
    [HttpDelete("me")]
    public async Task<IActionResult> DeleteMe(CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var deleted = await accountDeletion.DeleteAccountAsync(ownerId, ct);
        return deleted ? NoContent() : NotFound();
    }
}
