using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;

namespace Wander.Api.Weather;

/// <summary>
/// Transparent cache decorator. Cache key is rounded to ~1 km (2 dp) so nearby stops on
/// the same day share one network fetch and stay within Open-Meteo's rate limits.
///
/// Backed by <see cref="IDistributedCache"/> so a shared Azure Cache for Redis (cloud) or an
/// in-process store (local/CI) can be swapped via DI with no change here (architecture §6).
/// </summary>
public class CachingWeatherProvider(IWeatherProvider inner, IDistributedCache cache) : IWeatherProvider
{
    public static readonly TimeSpan ForecastTtl = TimeSpan.FromHours(2);
    public static readonly TimeSpan ClimateTtl  = TimeSpan.FromHours(24);

    public async Task<WeatherObservation?> GetWeatherAsync(
        double latitude, double longitude, DateOnly date, CancellationToken ct)
    {
        // Round to 2 decimal places ≈ 1.1 km at equator.
        var lat2 = Math.Round(latitude,  2);
        var lng2 = Math.Round(longitude, 2);
        var key  = $"weather:{lat2}:{lng2}:{date:yyyyMMdd}";

        // A stored JSON "null" (no data) is distinct from a missing key, so a known
        // "no observation" is served from cache without re-hitting the provider.
        var cached = await cache.GetStringAsync(key, ct);
        if (cached is not null)
            return JsonSerializer.Deserialize<WeatherObservation?>(cached);

        var obs = await inner.GetWeatherAsync(latitude, longitude, date, ct);
        var ttl = obs?.IsClimateSummary == true ? ClimateTtl : ForecastTtl;
        await cache.SetStringAsync(
            key,
            JsonSerializer.Serialize(obs),
            new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = ttl },
            ct);
        return obs;
    }
}
