using System.Security.Claims;

namespace Wander.Api.Security;

public static class ClaimsPrincipalExtensions
{
    public static string? GetUserId(this ClaimsPrincipal principal) =>
        principal.FindFirstValue("sub")
        ?? principal.FindFirstValue("oid")
        ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
}
