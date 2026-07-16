using System.Text.Json.Serialization;

namespace Wander.Api.Models;

/// <summary>A member's capability on a trip. Serialized as a string ("Owner"/"Editor"/"Viewer") so
/// it matches <see cref="Trip.AccessRole"/> and is stable for clients.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
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
