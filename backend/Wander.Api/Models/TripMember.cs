namespace Wander.Api.Models;

public enum TripMemberRole
{
    Owner,
    Editor,
    Viewer
}

public class TripMember
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string OwnerId { get; set; } = string.Empty;
    public Guid TripId { get; set; }
    public Guid UserId { get; set; }
    public TripMemberRole Role { get; set; } = TripMemberRole.Viewer;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DeletedAt { get; set; }
}
