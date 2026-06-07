using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;

namespace Wander.Api.Places;

/// <summary>
/// Transparent cache decorator around any <see cref="IPlaceProvider"/>.
/// Autocomplete results are cached for <see cref="AutocompleteTtl"/> (short — queries are cheap).
/// Detail lookups are cached for <see cref="DetailsTtl"/> (long — a place's coordinates rarely change).
/// Cache keys never include provider credentials.
///
/// Backed by <see cref="IDistributedCache"/> so a shared Azure Cache for Redis (cloud) or an
/// in-process store (local/CI) can be swapped via DI with no change here (architecture §6).
/// </summary>
public class CachingPlaceProvider(IPlaceProvider inner, IDistributedCache cache) : IPlaceProvider
{
    public static readonly TimeSpan AutocompleteTtl = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan DetailsTtl = TimeSpan.FromHours(24);

    public async Task<IReadOnlyList<PlaceCandidate>> SearchAsync(string query, int limit, PlaceSearchOptions options, CancellationToken ct)
    {
        // Suggestions vary by query, limit, and proximity bias — but NOT by session token (that only
        // affects billing, not results), so the key excludes it to keep cache hits across sessions.
        var prox = options is { ProximityLng: not null, ProximityLat: not null }
            ? $"{options.ProximityLng.Value:F2},{options.ProximityLat.Value:F2}"
            : "-";
        var key = $"places:ac:{limit}:{prox}:{query.Trim().ToLowerInvariant()}";

        var cached = await cache.GetStringAsync(key, ct);
        if (cached is not null)
            return JsonSerializer.Deserialize<IReadOnlyList<PlaceCandidate>>(cached) ?? [];

        var result = await inner.SearchAsync(query, limit, options, ct);
        await cache.SetStringAsync(
            key,
            JsonSerializer.Serialize(result),
            new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = AutocompleteTtl },
            ct);
        return result;
    }

    public async Task<PlaceDetails?> GetDetailsAsync(string placeId, string? sessionToken, CancellationToken ct)
    {
        var key = $"places:detail:{placeId}";

        // A stored JSON "null" (not-found) is distinct from a missing key, so a known
        // not-found is served from cache without re-hitting the provider.
        var cached = await cache.GetStringAsync(key, ct);
        if (cached is not null)
            return JsonSerializer.Deserialize<PlaceDetails?>(cached);

        var result = await inner.GetDetailsAsync(placeId, sessionToken, ct);
        await cache.SetStringAsync(
            key,
            JsonSerializer.Serialize(result),
            new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = DetailsTtl },
            ct);
        return result;
    }
}
