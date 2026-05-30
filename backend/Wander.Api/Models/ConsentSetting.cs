namespace Wander.Api.Models;

public class ConsentSetting
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string OwnerId { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public bool ShareEnabled { get; set; }
    public bool PublishEnabled { get; set; }
    public bool AiUseEnabled { get; set; }
    public bool AiTrainingEnabled { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DeletedAt { get; set; }
}
