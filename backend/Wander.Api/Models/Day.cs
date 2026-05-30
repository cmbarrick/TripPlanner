namespace Wander.Api.Models;

/// <summary>A single day within a trip, holding ordered itinerary items.</summary>
public class Day
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TripId { get; set; }
    public string OwnerId { get; set; } = "demo-user";
    public int DayNumber { get; set; }
    public DateOnly Date { get; set; }

    /// <summary>Short weather label, e.g. "Sunny", "Partly cloudy".</summary>
    public string? WeatherSummary { get; set; }
    public int? WeatherHighC { get; set; }

    /// <summary>Emoji/icon key used by the client, e.g. "sun", "cloud-sun".</summary>
    public string? WeatherIcon { get; set; }

    public List<ItineraryItem> Items { get; set; } = new();
    public List<PackingItem> PackingItems { get; set; } = new();

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DeletedAt { get; set; }
}
