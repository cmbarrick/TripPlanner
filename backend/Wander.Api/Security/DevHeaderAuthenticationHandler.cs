using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Wander.Api.Security;

public class DevHeaderAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IConfiguration configuration,
    IHostEnvironment environment)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!environment.IsDevelopment() || !configuration.GetValue<bool>("Authentication:DevBypass:Enabled"))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var userId = Request.Headers["X-Dev-User-Id"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(userId) && Request.Path.StartsWithSegments("/hubs"))
        {
            // SignalR WebSocket handshakes can't carry custom headers; the dev client passes the
            // identity in the query string instead (mirrors the JWT access_token convention).
            userId = Request.Query["dev_user_id"].FirstOrDefault();
        }
        if (string.IsNullOrWhiteSpace(userId))
        {
            userId = configuration["Authentication:DevBypass:DefaultUserId"];
        }

        if (string.IsNullOrWhiteSpace(userId))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var claims = new[]
        {
            new Claim("sub", userId),
            new Claim(ClaimTypes.NameIdentifier, userId)
        };
        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
