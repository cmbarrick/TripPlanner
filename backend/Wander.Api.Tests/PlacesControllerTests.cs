using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Wander.Api.Controllers;
using Wander.Api.Places;

namespace Wander.Api.Tests;

/// <summary>
/// Unit tests for <see cref="PlacesController"/>. The controller is exercised directly
/// (no full ASP.NET middleware) so tests are fast and require no HTTP stack or API key.
/// </summary>
public class PlacesControllerTests
{
    private static IMemoryCache NewCache() =>
        new MemoryCache(Options.Create(new MemoryCacheOptions()));

    private static PlacesController ControllerWithFake(IPlaceProvider? provider = null)
    {
        var p = provider ?? new CachingPlaceProvider(new FakePlaceProvider(), NewCache());
        return new PlacesController(p);
    }

    // ── Autocomplete ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Autocomplete_ValidQuery_ReturnsResults()
    {
        var ctrl = ControllerWithFake();
        var result = await ctrl.Autocomplete("Eiffel", limit: 5);
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var items = Assert.IsAssignableFrom<IEnumerable<AutocompleteResult>>(ok.Value);
        Assert.NotEmpty(items);
    }

    [Fact]
    public async Task Autocomplete_EmptyQuery_ReturnsBadRequest()
    {
        var ctrl = ControllerWithFake();
        var result = await ctrl.Autocomplete("   ");
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Theory]
    [InlineData(0)]  // clamped to 1
    [InlineData(100)] // clamped to MaxResults (8)
    public async Task Autocomplete_OutOfRangeLimit_Clamps(int limit)
    {
        var ctrl = ControllerWithFake();
        var result = await ctrl.Autocomplete("tower", limit: limit);
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var items = Assert.IsAssignableFrom<IEnumerable<AutocompleteResult>>(ok.Value).ToList();
        Assert.True(items.Count <= 8);
    }

    [Fact]
    public async Task Autocomplete_ProviderThrows_Returns503()
    {
        var ctrl = new PlacesController(new ThrowingPlaceProvider());
        var result = await ctrl.Autocomplete("anything");
        var status = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(503, status.StatusCode);
    }

    [Fact]
    public async Task Autocomplete_ResponseNeverContainsProviderToken()
    {
        // The controller serializes only the DTO fields we explicitly project.
        // Verify no field named "token", "key", or "accessToken" slips through.
        var ctrl = ControllerWithFake();
        var result = await ctrl.Autocomplete("Colosseum");
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var json = System.Text.Json.JsonSerializer.Serialize(ok.Value);
        Assert.DoesNotContain("token", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("accessToken", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("apiKey", json, StringComparison.OrdinalIgnoreCase);
    }

    // ── Details ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Details_KnownId_ReturnsDetails()
    {
        var ctrl = ControllerWithFake();
        var result = await ctrl.Details("fake_colosseum");
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var detail = Assert.IsType<PlaceDetailsResult>(ok.Value);
        Assert.Equal("fake_colosseum", detail.PlaceId);
        Assert.Equal("Colosseum", detail.Name);
        Assert.True(detail.Latitude != 0);
        Assert.True(detail.Longitude != 0);
    }

    [Fact]
    public async Task Details_UnknownId_ReturnsNotFound()
    {
        var ctrl = ControllerWithFake();
        var result = await ctrl.Details("does_not_exist");
        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task Details_ProviderThrows_Returns503()
    {
        var ctrl = new PlacesController(new ThrowingPlaceProvider());
        var result = await ctrl.Details("any_id");
        var status = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(503, status.StatusCode);
    }

    // ── Cache behavior ────────────────────────────────────────────────────────

    [Fact]
    public async Task Autocomplete_SameQuery_HitsCache_ProviderCalledOnce()
    {
        var counting = new CountingPlaceProvider(new FakePlaceProvider());
        var cached = new CachingPlaceProvider(counting, NewCache());
        var ctrl = new PlacesController(cached);

        await ctrl.Autocomplete("Eiffel");
        await ctrl.Autocomplete("eiffel"); // same query, different casing — same cache key
        await ctrl.Autocomplete("EIFFEL");

        Assert.Equal(1, counting.SearchCallCount);
    }

    [Fact]
    public async Task Details_SameId_HitsCache_ProviderCalledOnce()
    {
        var counting = new CountingPlaceProvider(new FakePlaceProvider());
        var cached = new CachingPlaceProvider(counting, NewCache());
        var ctrl = new PlacesController(cached);

        await ctrl.Details("fake_eiffel_tower");
        await ctrl.Details("fake_eiffel_tower");

        Assert.Equal(1, counting.DetailCallCount);
    }

    // ── Test helpers ──────────────────────────────────────────────────────────

    private sealed class ThrowingPlaceProvider : IPlaceProvider
    {
        public Task<IReadOnlyList<PlaceCandidate>> SearchAsync(string q, int limit, CancellationToken ct) =>
            throw new HttpRequestException("simulated network failure");

        public Task<PlaceDetails?> GetDetailsAsync(string id, CancellationToken ct) =>
            throw new HttpRequestException("simulated network failure");
    }

    private sealed class CountingPlaceProvider(IPlaceProvider inner) : IPlaceProvider
    {
        public int SearchCallCount { get; private set; }
        public int DetailCallCount { get; private set; }

        public async Task<IReadOnlyList<PlaceCandidate>> SearchAsync(string q, int limit, CancellationToken ct)
        {
            SearchCallCount++;
            return await inner.SearchAsync(q, limit, ct);
        }

        public async Task<PlaceDetails?> GetDetailsAsync(string id, CancellationToken ct)
        {
            DetailCallCount++;
            return await inner.GetDetailsAsync(id, ct);
        }
    }
}
