using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Wander.Api.Tests;

/// <summary>
/// Builds a fake <see cref="ControllerContext"/> so controller unit tests can exercise
/// endpoints that call <c>User.GetUserId()</c> without a real authentication middleware stack.
/// </summary>
public static class FakeAuth
{
    public static ControllerContext ForUser(string userId) =>
        new()
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(
                    new ClaimsIdentity(
                        [new Claim("sub", userId)],
                        authenticationType: "test")),
            },
        };
}
