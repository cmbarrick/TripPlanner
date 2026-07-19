using System.Net;
using Microsoft.Extensions.Configuration;
using Wander.Api.Activities;

namespace Wander.Api.Tests;

public class ViatorActivityProviderTests
{
    [Fact]
    public void Constructor_WithApiKeyConfigured_DoesNotThrow()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Activities:ViatorApiKey"] = "test-key",
            })
            .Build();

        using var http = new HttpClient();
        var provider = new ViatorActivityProvider(http, config);

        Assert.NotNull(provider);
    }

    [Fact]
    public void Constructor_WithoutApiKey_Throws()
    {
        var config = new ConfigurationBuilder().Build();
        using var http = new HttpClient();

        Assert.Throws<InvalidOperationException>(() => new ViatorActivityProvider(http, config));
    }

    // Regression: a base URL without a trailing slash makes `new Uri(base, relative)` drop the
    // base's last path segment ("partner"), silently hitting the wrong host
    // (api.sandbox.viator.com/search/freetext, a 404) instead of .../partner/search/freetext. The
    // 404 was itself swallowed by SearchAsync's `!IsSuccessStatusCode -> return []`, so this bug
    // presented as "search always returns zero results" rather than a visible error.
    [Theory]
    [InlineData(null)] // default sandbox host
    [InlineData("https://api.viator.com/partner")] // configured without trailing slash
    [InlineData("https://api.viator.com/partner/")] // configured with trailing slash
    public async Task SearchAsync_AlwaysRequestsUnderPartnerPath(string? configuredBaseUrl)
    {
        Uri? capturedUri = null;
        var handler = new CapturingHandler(req =>
        {
            capturedUri = req.RequestUri;
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""{"products":{"results":[]}}""",
                    System.Text.Encoding.UTF8, "application/json"),
            };
        });

        var settings = new Dictionary<string, string?> { ["Activities:ViatorApiKey"] = "test-key" };
        if (configuredBaseUrl is not null)
            settings["Activities:ViatorBaseUrl"] = configuredBaseUrl;
        var config = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();

        using var http = new HttpClient(handler);
        var provider = new ViatorActivityProvider(http, config);

        await provider.SearchAsync("Interlaken", null, "walking tour", "EUR", 5, CancellationToken.None);

        Assert.NotNull(capturedUri);
        Assert.Equal("/partner/search/freetext", capturedUri!.AbsolutePath);
    }

    private sealed class CapturingHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(respond(request));
    }
}
