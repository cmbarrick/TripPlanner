using Microsoft.Extensions.Caching.Memory;

namespace Wander.Api.Ai;

public interface IAiChatRateLimiter
{
    bool TryAcquire(string ownerId);
}

public sealed class AiChatRateLimiter(IMemoryCache cache) : IAiChatRateLimiter
{
    public const int MaxRequestsPerMinute = 20;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    public bool TryAcquire(string ownerId)
    {
        var key = $"ai-chat-rate:{ownerId}";
        cache.TryGetValue(key, out int count);
        if (count >= MaxRequestsPerMinute)
            return false;

        cache.Set(key, count + 1, Window);
        return true;
    }
}
