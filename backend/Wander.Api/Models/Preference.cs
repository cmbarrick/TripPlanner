namespace Wander.Api.Models;

public class Preference
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string OwnerId { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public string TemperatureUnit { get; set; } = "F";
    public string DistanceUnit { get; set; } = "mi";
    public string Currency { get; set; } = "USD";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DeletedAt { get; set; }
}
