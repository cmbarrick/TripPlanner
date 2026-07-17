using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Wander.Api.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ItineraryItemType
{
    Flight,
    Lodging,
    Food,
    Activity,
    Transport
}

/// <summary>
/// Lifecycle state of an itinerary item. Independent of whether the item has a date/time:
/// an item can carry any status whether scheduled on a day or sitting in the trip backlog.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ItineraryItemStatus
{
    /// <summary>Locked into the plan (bookings, fixed plans). Counts toward the trip cost total.</summary>
    Confirmed,
    /// <summary>Pencilled in but not locked. Excluded from hard conflict warnings; shown muted.</summary>
    Tentative,
    /// <summary>An idea, typically with no date/time, living in the trip's "Ideas" backlog.</summary>
    Wishlist
}

/// <summary>A single stop/event on a trip. Scheduled onto a day (<see cref="DayId"/> set) or
/// sitting in the trip-level backlog (<see cref="DayId"/> null).</summary>
public class ItineraryItem : IValidatableObject
{
    public const int MaxTitleLength = 200;
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Durable link to the owning trip; set for scheduled and backlog items alike.</summary>
    public Guid TripId { get; set; }

    /// <summary>Day this item is scheduled on, or <c>null</c> when it lives in the trip backlog.</summary>
    public Guid? DayId { get; set; }
    public string OwnerId { get; set; } = "demo-user";
    public ItineraryItemType Type { get; set; } = ItineraryItemType.Activity;
    public ItineraryItemStatus Status { get; set; } = ItineraryItemStatus.Confirmed;

    [Required(AllowEmptyStrings = false, ErrorMessage = "Title is required.")]
    public string Title { get; set; } = string.Empty;
    /// <summary>IATA flight number (e.g. "BA 123"). Only meaningful when <see cref="Type"/> is <see cref="ItineraryItemType.Flight"/>.</summary>
    public string? FlightNumber { get; set; }

    public string? LocationName { get; set; }
    public string? Address { get; set; }
    public string? PlaceId { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }

    [Range(0, double.MaxValue, ErrorMessage = "Cost cannot be negative.")]
    public decimal? Cost { get; set; }
    public string Currency { get; set; } = "EUR";

    public string? ConfirmationNo { get; set; }

    /// <summary>Optional booking/confirmation URL (e.g. a GetYourGuide voucher or reservation link).</summary>
    public string? BookingUrl { get; set; }

    public string? Notes { get; set; }

    /// <summary>Ordering within the day.</summary>
    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DeletedAt { get; set; }

    /// <summary>Optimistic concurrency token, backed by Postgres's <c>xmin</c> system column (see
    /// <c>WanderDbContext</c>). The client round-trips whatever value it last read; a stale write
    /// (someone else updated the row since) fails with a 409 instead of silently overwriting their
    /// change — see <see cref="Wander.Api.Data.ConcurrencyConflictException"/>.</summary>
    public uint Version { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Title.Length > MaxTitleLength)
            yield return new ValidationResult(
                $"Title cannot exceed {MaxTitleLength} characters.", [nameof(Title)]);

        if (string.IsNullOrWhiteSpace(Currency) || Currency.Trim().Length != 3)
            yield return new ValidationResult(
                "Currency must be a 3-letter code (e.g. EUR, USD).", [nameof(Currency)]);

        if (StartTime is { } start && EndTime is { } end && end < start)
            yield return new ValidationResult(
                "End time must be on or after the start time.", [nameof(EndTime)]);
    }
}
