namespace Wander.Api.Models;

public class Preference
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string OwnerId { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public string TemperatureUnit { get; set; } = "F";
    public string DistanceUnit { get; set; } = "mi";
    public string Currency { get; set; } = "USD";
    /// <summary>Primary trip vibe for AI planning, e.g. foodie, culture, adventure.</summary>
    public string? TravelStyle { get; set; }
    /// <summary>How packed the day should feel: relaxed, moderate, packed.</summary>
    public string? Pace { get; set; }
    /// <summary>Dietary constraint for restaurants and food stops.</summary>
    public string? Diet { get; set; }
    /// <summary>Spend band for suggestions: budget, mid, luxury.</summary>
    public string? BudgetBand { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DeletedAt { get; set; }
}
