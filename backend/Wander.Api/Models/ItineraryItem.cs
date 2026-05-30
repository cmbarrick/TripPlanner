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

/// <summary>A single stop/event on a day's itinerary.</summary>
public class ItineraryItem : IValidatableObject
{
    public const int MaxTitleLength = 200;
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DayId { get; set; }
    public string OwnerId { get; set; } = "demo-user";
    public ItineraryItemType Type { get; set; } = ItineraryItemType.Activity;

    [Required(AllowEmptyStrings = false, ErrorMessage = "Title is required.")]
    public string Title { get; set; } = string.Empty;
    public string? LocationName { get; set; }
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
