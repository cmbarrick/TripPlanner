namespace Wander.Api.Models;

public enum TripShareMode
{
    Link,
    Account
}

public class TripShare
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string OwnerId { get; set; } = string.Empty;
    public Guid TripId { get; set; }
    public TripShareMode Mode { get; set; } = TripShareMode.Account;
    public TripMemberRole Role { get; set; } = TripMemberRole.Viewer;
    public string? Token { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DeletedAt { get; set; }
}
