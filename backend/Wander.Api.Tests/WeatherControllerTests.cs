using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Wander.Api.Controllers;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Weather;

namespace Wander.Api.Tests;

/// <summary>
/// Unit tests for <see cref="WeatherController"/> and the weather provider stack.
/// All tests use <see cref="FakeWeatherProvider"/> — no network calls, no API key required.
/// </summary>
public class WeatherControllerTests
{
    private static IMemoryCache NewCache() =>
        new MemoryCache(Options.Create(new MemoryCacheOptions()));

    private static CachingWeatherProvider CachedFake(IMemoryCache? cache = null) =>
        new(new FakeWeatherProvider(), cache ?? NewCache());

    // ── WeatherController ─────────────────────────────────────────────────────

    [Fact]
    public async Task Get_OwnedTripWithLocatedItems_ReturnsWeather()
    {
        var (ctrl, trip) = BuildController(hasLocatedItems: true);
        var result = await ctrl.Get(trip.Id, CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var body = Assert.IsType<TripWeatherResponse>(ok.Value);
        Assert.NotEmpty(body.Items);
        Assert.NotEmpty(body.Days);
    }

    [Fact]
    public async Task Get_OwnedTripNoLocatedItems_ReturnsEmptyLists()
    {
        var (ctrl, trip) = BuildController(hasLocatedItems: false);
        var result = await ctrl.Get(trip.Id, CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var body = Assert.IsType<TripWeatherResponse>(ok.Value);
        Assert.Empty(body.Items);
        Assert.Empty(body.Days);
    }

    [Fact]
    public async Task Get_UnknownTrip_ReturnsNotFound()
    {
        var (ctrl, _) = BuildController(hasLocatedItems: true);
        var result = await ctrl.Get(Guid.NewGuid(), CancellationToken.None);
        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task Get_ResponseNeverContainsApiKey()
    {
        // Verify no field name or value that looks like a secret slips through.
        var (ctrl, trip) = BuildController(hasLocatedItems: true);
        var result = await ctrl.Get(trip.Id, CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var json = System.Text.Json.JsonSerializer.Serialize(ok.Value);
        Assert.DoesNotContain("token", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("apiKey", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("accessToken", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Get_ItemWeather_HighCGreaterThanLowC()
    {
        var (ctrl, trip) = BuildController(hasLocatedItems: true);
        var result = await ctrl.Get(trip.Id, CancellationToken.None);
        var body = ((result.Result as OkObjectResult)!.Value as TripWeatherResponse)!;
        foreach (var w in body.Items)
            Assert.True(w.HighC >= w.LowC, $"HighC {w.HighC} should be >= LowC {w.LowC}");
    }

    // ── FakeWeatherProvider ───────────────────────────────────────────────────

    [Fact]
    public async Task FakeProvider_NearFutureDate_IsNotClimateSummary()
    {
        var provider = new FakeWeatherProvider();
        var soon = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(3);
        var obs = await provider.GetWeatherAsync(48.86, 2.29, soon, CancellationToken.None);
        Assert.NotNull(obs);
        Assert.False(obs!.IsClimateSummary);
    }

    [Fact]
    public async Task FakeProvider_FarFutureDate_IsClimateSummary()
    {
        var provider = new FakeWeatherProvider();
        var far = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(60);
        var obs = await provider.GetWeatherAsync(48.86, 2.29, far, CancellationToken.None);
        Assert.NotNull(obs);
        Assert.True(obs!.IsClimateSummary);
    }

    // ── CachingWeatherProvider ────────────────────────────────────────────────

    [Fact]
    public async Task Cache_SameLocation_ProviderCalledOnce()
    {
        var counting = new CountingWeatherProvider(new FakeWeatherProvider());
        var cached = new CachingWeatherProvider(counting, NewCache());
        var date = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(2);

        await cached.GetWeatherAsync(48.86, 2.29, date, CancellationToken.None);
        await cached.GetWeatherAsync(48.86, 2.29, date, CancellationToken.None);
        await cached.GetWeatherAsync(48.860001, 2.290001, date, CancellationToken.None); // rounds to same key

        Assert.Equal(1, counting.CallCount);
    }

    [Fact]
    public async Task Cache_DifferentDates_ProviderCalledPerDate()
    {
        var counting = new CountingWeatherProvider(new FakeWeatherProvider());
        var cached = new CachingWeatherProvider(counting, NewCache());
        var d1 = new DateOnly(2026, 7, 1);
        var d2 = new DateOnly(2026, 7, 2);

        await cached.GetWeatherAsync(48.86, 2.29, d1, CancellationToken.None);
        await cached.GetWeatherAsync(48.86, 2.29, d2, CancellationToken.None);

        Assert.Equal(2, counting.CallCount);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static (WeatherController ctrl, Trip trip) BuildController(bool hasLocatedItems)
    {
        const string OwnerId = "test-user";
        var db = Guid.NewGuid().ToString();
        var ctx = new WanderDbContext(
            new DbContextOptionsBuilder<WanderDbContext>()
                .UseInMemoryDatabase(db)
                .Options);

        var day = new Day
        {
            Id        = Guid.NewGuid(),
            DayNumber = 1,
            Date      = new DateOnly(2026, 7, 1),
            OwnerId   = OwnerId,
        };

        if (hasLocatedItems)
        {
            day.Items.Add(new ItineraryItem
            {
                Id        = Guid.NewGuid(),
                OwnerId   = OwnerId,
                Title     = "Eiffel Tower",
                Type      = ItineraryItemType.Activity,
                Status    = ItineraryItemStatus.Confirmed,
                Latitude  = 48.858,
                Longitude = 2.294,
                Currency  = "EUR",
            });
        }

        var trip = new Trip
        {
            Id          = Guid.NewGuid(),
            OwnerId     = OwnerId,
            Title       = "Paris",
            Destination = "Paris, France",
            StartDate   = new DateOnly(2026, 7, 1),
            EndDate     = new DateOnly(2026, 7, 3),
            Travelers   = 2,
            CoverTheme  = "paris",
            Currency    = "EUR",
            Days        = [day],
        };
        day.TripId = trip.Id;
        foreach (var item in day.Items) { item.TripId = trip.Id; item.DayId = day.Id; }

        ctx.Trips.Add(trip);
        ctx.SaveChanges();

        var repo = new EfCoreTripRepository(ctx);
        var provider = CachedFake();
        var ctrl = new WeatherController(repo, provider);
        ctrl.ControllerContext = FakeAuth.ForUser(OwnerId);
        return (ctrl, trip);
    }

    private sealed class CountingWeatherProvider(IWeatherProvider inner) : IWeatherProvider
    {
        public int CallCount { get; private set; }

        public async Task<WeatherObservation?> GetWeatherAsync(
            double lat, double lng, DateOnly date, CancellationToken ct)
        {
            CallCount++;
            return await inner.GetWeatherAsync(lat, lng, date, ct);
        }
    }
}
