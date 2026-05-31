using Microsoft.Extensions.Caching.Memory;

namespace Wander.Api.Places;

/// <summary>
/// Transparent cache decorator around any <see cref="IPlaceProvider"/>.
/// Autocomplete results are cached for <see cref="AutocompleteTtl"/> (short — queries are cheap).
/// Detail lookups are cached for <see cref="DetailsTtl"/> (long — a place's coordinates rarely change).
/// Cache keys never include provider credentials.
/// </summary>
public class CachingPlaceProvider(IPlaceProvider inner, IMemoryCache cache) : IPlaceProvider
{
    public static readonly TimeSpan AutocompleteTtl = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan DetailsTtl = TimeSpan.FromHours(24);

    public Task<IReadOnlyList<PlaceCandidate>> SearchAsync(string query, int limit, CancellationToken ct)
    {
        var key = $"places:ac:{limit}:{query.Trim().ToLowerInvariant()}";
        return cache.GetOrCreateAsync(key, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = AutocompleteTtl;
            return await inner.SearchAsync(query, limit, ct);
        })!;
    }

    public Task<PlaceDetails?> GetDetailsAsync(string placeId, CancellationToken ct)
    {
        var key = $"places:detail:{placeId}";
        return cache.GetOrCreateAsync(key, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = DetailsTtl;
            return await inner.GetDetailsAsync(placeId, ct);
        })!;
    }
}
