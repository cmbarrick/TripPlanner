using Wander.Api.Data;
using Wander.Api.Models;

namespace Wander.Api.Tests;

public class InMemoryTripRepositoryTests
{
    [Fact]
    public void GetAll_ReturnsOnlyTripsForRequestedOwner()
    {
        var repo = new InMemoryTripRepository();

        repo.Add(new Trip
        {
            OwnerId = "owner-a",
            Title = "Owner A Trip",
            Destination = "A City",
            StartDate = new DateOnly(2026, 7, 1),
            EndDate = new DateOnly(2026, 7, 2),
            Currency = "USD",
            CoverTheme = "lisbon"
        });

        repo.Add(new Trip
        {
            OwnerId = "owner-b",
            Title = "Owner B Trip",
            Destination = "B City",
            StartDate = new DateOnly(2026, 8, 1),
            EndDate = new DateOnly(2026, 8, 2),
            Currency = "USD",
            CoverTheme = "kyoto"
        });

        var ownerATrips = repo.GetAll("owner-a").ToList();

        Assert.Single(ownerATrips);
        Assert.Equal("owner-a", ownerATrips[0].OwnerId);
        Assert.Equal("Owner A Trip", ownerATrips[0].Title);
    }

    [Fact]
    public void Delete_DeniesWhenOwnerDoesNotMatch()
    {
        var repo = new InMemoryTripRepository();
        var created = repo.Add(new Trip
        {
            OwnerId = "owner-a",
            Title = "Delete Guard",
            Destination = "Safe City",
            StartDate = new DateOnly(2026, 9, 1),
            EndDate = new DateOnly(2026, 9, 2),
            Currency = "USD",
            CoverTheme = "alps"
        });

        var deletedByOtherOwner = repo.Delete(created.Id, "owner-b");
        var deletedByOwner = repo.Delete(created.Id, "owner-a");

        Assert.False(deletedByOtherOwner);
        Assert.True(deletedByOwner);
    }

    [Fact]
    public void AddItem_DeniesWhenOwnerDoesNotMatch()
    {
        var repo = new InMemoryTripRepository();
        var trip = repo.Add(new Trip
        {
            OwnerId = "owner-a",
            Title = "Item Guard Trip",
            Destination = "Item City",
            StartDate = new DateOnly(2026, 10, 1),
            EndDate = new DateOnly(2026, 10, 2),
            Currency = "USD",
            CoverTheme = "lisbon",
            Days = new List<Day>
            {
                new()
                {
                    DayNumber = 1,
                    Date = new DateOnly(2026, 10, 1),
                    OwnerId = "owner-a"
                }
            }
        });

        var dayId = trip.Days[0].Id;
        var denied = repo.AddItem(trip.Id, "owner-b", dayId, new ItineraryItem { Title = "Blocked Item" });
        var allowed = repo.AddItem(trip.Id, "owner-a", dayId, new ItineraryItem { Title = "Allowed Item" });

        Assert.Null(denied);
        Assert.NotNull(allowed);
        Assert.Equal("owner-a", allowed!.OwnerId);
    }
}
