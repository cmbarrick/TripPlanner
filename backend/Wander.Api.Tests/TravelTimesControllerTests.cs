using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wander.Api.Controllers;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Routing;

namespace Wander.Api.Tests;

public class TravelTimesControllerTests
{
    // ── HaversineRoutingProvider ──────────────────────────────────────────────

    [Fact]
    public async Task Haversine_KnownDistance_ReturnsCorrectKm()
    {
        // Eiffel Tower → Notre-Dame ≈ 3.8 km straight line.
        var provider = new HaversineRoutingProvider();
        var result = await provider.GetEstimateAsync(48.8584, 2.2945, 48.8530, 2.3499, CancellationToken.None);
        Assert.NotNull(result);
        Assert.InRange(result!.DistanceKm, 3.0, 4.5);
    }

    [Fact]
    public async Task Haversine_SamePoint_ReturnsNearZero()
    {
        var provider = new HaversineRoutingProvider();
        var result = await provider.GetEstimateAsync(48.86, 2.29, 48.86, 2.29, CancellationToken.None);
        Assert.NotNull(result);
        Assert.True(result!.DistanceKm < 0.01);
        Assert.Equal(1, result.WalkingMinutes);  // clamped to minimum 1
        Assert.Equal(1, result.DrivingMinutes);
    }

    [Fact]
    public async Task Haversine_WalkingFasterThanDriving_NeverTrue()
    {
        var provider = new HaversineRoutingProvider();
        var result = await provider.GetEstimateAsync(37.29, 13.58, 37.85, 15.29, CancellationToken.None);
        Assert.NotNull(result);
        Assert.True(result!.WalkingMinutes >= result.DrivingMinutes);
    }

    // ── TravelTimesController ─────────────────────────────────────────────────

    [Fact]
    public async Task Get_ConsecutiveLocatedTimedItems_ReturnsSegment()
    {
        var (ctrl, trip) = BuildController(itemCount: 2, withCoords: true, withTimes: true);
        var result = await ctrl.Get(trip.Id, CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var body = Assert.IsType<TravelTimesResponse>(ok.Value);
        Assert.Single(body.Segments);
        Assert.True(body.Segments[0].DistanceKm > 0);
    }

    [Fact]
    public async Task Get_ItemsWithoutCoords_SkipsSegment()
    {
        var (ctrl, trip) = BuildController(itemCount: 2, withCoords: false, withTimes: true);
        var result = await ctrl.Get(trip.Id, CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var body = Assert.IsType<TravelTimesResponse>(ok.Value);
        Assert.Empty(body.Segments);
    }

    [Fact]
    public async Task Get_ItemsWithoutTimes_SkipsSegment()
    {
        var (ctrl, trip) = BuildController(itemCount: 2, withCoords: true, withTimes: false);
        var result = await ctrl.Get(trip.Id, CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var body = Assert.IsType<TravelTimesResponse>(ok.Value);
        Assert.Empty(body.Segments);
    }

    [Fact]
    public async Task Get_UnknownTrip_ReturnsNotFound()
    {
        var (ctrl, _) = BuildController(itemCount: 2, withCoords: true, withTimes: true);
        var result = await ctrl.Get(Guid.NewGuid(), CancellationToken.None);
        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task Get_ThreeItems_ReturnsTwoSegments()
    {
        var (ctrl, trip) = BuildController(itemCount: 3, withCoords: true, withTimes: true);
        var result = await ctrl.Get(trip.Id, CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var body = Assert.IsType<TravelTimesResponse>(ok.Value);
        Assert.Equal(2, body.Segments.Count);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static (TravelTimesController ctrl, Trip trip) BuildController(
        int itemCount, bool withCoords, bool withTimes)
    {
        const string OwnerId = "test-user";
        var dbName = Guid.NewGuid().ToString();
        var ctx = new WanderDbContext(
            new DbContextOptionsBuilder<WanderDbContext>()
                .UseInMemoryDatabase(dbName).Options);

        var day = new Day
        {
            Id = Guid.NewGuid(), DayNumber = 1,
            Date = new DateOnly(2026, 7, 1), OwnerId = OwnerId,
        };

        // Two stops in Rome ~2 km apart, three stops add Colosseum.
        double[][] coords = [[41.9022, 12.4539], [41.8902, 12.4922], [41.9029, 12.4964]];
        for (var i = 0; i < itemCount; i++)
        {
            day.Items.Add(new ItineraryItem
            {
                Id        = Guid.NewGuid(), OwnerId = OwnerId,
                Title     = $"Stop {i + 1}", Currency = "EUR",
                Type      = ItineraryItemType.Activity,
                Status    = ItineraryItemStatus.Confirmed,
                Latitude  = withCoords ? coords[i][0] : null,
                Longitude = withCoords ? coords[i][1] : null,
                StartTime = withTimes ? new TimeOnly(9 + i, 0) : null,
            });
        }

        var trip = new Trip
        {
            Id = Guid.NewGuid(), OwnerId = OwnerId, Title = "Rome",
            Destination = "Rome, Italy", Currency = "EUR",
            StartDate = new DateOnly(2026, 7, 1), EndDate = new DateOnly(2026, 7, 3),
            Travelers = 2, CoverTheme = "rome", Days = [day],
        };
        day.TripId = trip.Id;
        foreach (var item in day.Items) { item.TripId = trip.Id; item.DayId = day.Id; }

        ctx.Trips.Add(trip);
        ctx.SaveChanges();

        var ctrl = new TravelTimesController(new EfCoreTripRepository(ctx), new HaversineRoutingProvider());
        ctrl.ControllerContext = FakeAuth.ForUser(OwnerId);
        return (ctrl, trip);
    }
}
