using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Wander.Api.Models;

/// <summary>A planned trip owned by a user. Root of the itinerary tree.</summary>
public class Trip : IValidatableObject
{
    // Field length caps are enforced in Validate() (not via [StringLength]) so the
    // database schema/migrations stay unchanged while requests are still validated.
    public const int MaxTitleLength = 200;
    public const int MaxDestinationLength = 200;
    public const int MaxCoverThemeLength = 60;
    public const int MaxTravelers = 100;

    public Guid Id { get; set; } = Guid.NewGuid();
    public string OwnerId { get; set; } = "demo-user";

    [Required(AllowEmptyStrings = false, ErrorMessage = "Title is required.")]
    public string Title { get; set; } = string.Empty;

    [Required(AllowEmptyStrings = false, ErrorMessage = "Destination is required.")]
    public string Destination { get; set; } = string.Empty;

    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }

    [Range(1, MaxTravelers, ErrorMessage = "Travelers must be between 1 and 100.")]
    public int Travelers { get; set; } = 1;

    /// <summary>UI cover theme key (e.g. "lisbon", "kyoto", "alps").</summary>
    public string CoverTheme { get; set; } = "lisbon";

    [Range(0, double.MaxValue, ErrorMessage = "Estimated cost cannot be negative.")]
    public decimal EstimatedCost { get; set; }

    public string Currency { get; set; } = "EUR";

    /// <summary>
    /// IANA time zone of the destination (e.g. "Europe/Rome"). Itinerary times are stored as
    /// local wall-clock values; this zone lets us compute the correct absolute instant for
    /// notifications/reminders regardless of the user's device time zone.
    /// </summary>
    public string? TimeZoneId { get; set; }

    public List<Day> Days { get; set; } = new();

    /// <summary>
    /// Unscheduled "Ideas" backlog: itinerary items with no day (<c>DayId == null</c>). Not a mapped
    /// relationship — the repository populates this from the items table so the API payload carries the
    /// backlog alongside the scheduled days.
    /// </summary>
    [NotMapped]
    public List<ItineraryItem> UnscheduledItems { get; set; } = new();

    /// <summary>
    /// The requesting caller's capability on this trip ("Owner" / "Editor" / "Viewer"). Transport-only
    /// (not persisted); set by the controller so clients can render read-only vs. editable. Null when
    /// access wasn't resolved (e.g. legacy callers).
    /// </summary>
    [NotMapped]
    public string? AccessRole { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DeletedAt { get; set; }

    public int Nights => Math.Max(0, EndDate.DayNumber - StartDate.DayNumber);

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Title.Length > MaxTitleLength)
            yield return new ValidationResult(
                $"Title cannot exceed {MaxTitleLength} characters.", [nameof(Title)]);

        if (Destination.Length > MaxDestinationLength)
            yield return new ValidationResult(
                $"Destination cannot exceed {MaxDestinationLength} characters.", [nameof(Destination)]);

        if (!string.IsNullOrEmpty(CoverTheme) && CoverTheme.Length > MaxCoverThemeLength)
            yield return new ValidationResult(
                $"Cover theme cannot exceed {MaxCoverThemeLength} characters.", [nameof(CoverTheme)]);

        if (StartDate == default)
            yield return new ValidationResult("Start date is required.", [nameof(StartDate)]);

        if (EndDate == default)
            yield return new ValidationResult("End date is required.", [nameof(EndDate)]);

        if (StartDate != default && EndDate != default && EndDate < StartDate)
            yield return new ValidationResult(
                "End date must be on or after the start date.", [nameof(EndDate)]);

        if (string.IsNullOrWhiteSpace(Currency) || Currency.Trim().Length is < 3 or > 3)
            yield return new ValidationResult(
                "Currency must be a 3-letter code (e.g. EUR, USD).", [nameof(Currency)]);
    }
}
