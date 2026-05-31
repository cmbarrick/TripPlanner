using Microsoft.Extensions.Caching.Memory;

namespace Wander.Api.Weather;

/// <summary>
/// Transparent cache decorator. Cache key is rounded to ~1 km (2 dp) so nearby stops on
/// the same day share one network fetch and stay within Open-Meteo's rate limits.
/// </summary>
public class CachingWeatherProvider(IWeatherProvider inner, IMemoryCache cache) : IWeatherProvider
{
    public static readonly TimeSpan ForecastTtl = TimeSpan.FromHours(2);
    public static readonly TimeSpan ClimateTtl  = TimeSpan.FromHours(24);

    public Task<WeatherObservation?> GetWeatherAsync(
        double latitude, double longitude, DateOnly date, CancellationToken ct)
    {
        // Round to 2 decimal places ≈ 1.1 km at equator.
        var lat2 = Math.Round(latitude,  2);
        var lng2 = Math.Round(longitude, 2);
        var key  = $"weather:{lat2}:{lng2}:{date:yyyyMMdd}";

        return cache.GetOrCreateAsync(key, async entry =>
        {
            var obs = await inner.GetWeatherAsync(latitude, longitude, date, ct);
            entry.AbsoluteExpirationRelativeToNow =
                obs?.IsClimateSummary == true ? ClimateTtl : ForecastTtl;
            return obs;
        })!;
    }
}
