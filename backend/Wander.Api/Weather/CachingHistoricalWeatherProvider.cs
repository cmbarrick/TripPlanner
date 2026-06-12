using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;

namespace Wander.Api.Weather;

/// <summary>
/// Cache decorator for past-date actuals. Same ~1 km (2 dp) key rounding as
/// <see cref="CachingWeatherProvider"/>, but archive data is immutable so entries never expire
/// (a known "no data" is re-checked after a day in case the archive backfills).
/// </summary>
public class CachingHistoricalWeatherProvider(IHistoricalWeatherProvider inner, IDistributedCache cache)
    : IHistoricalWeatherProvider
{
    public static readonly TimeSpan MissTtl = TimeSpan.FromHours(24);

    public async Task<HistoricalWeather?> GetActualsAsync(
        double latitude, double longitude, DateOnly date, CancellationToken ct)
    {
        var lat2 = Math.Round(latitude,  2);
        var lng2 = Math.Round(longitude, 2);
        var key  = $"weathera:{lat2}:{lng2}:{date:yyyyMMdd}";

        var cached = await cache.GetStringAsync(key, ct);
        if (cached is not null)
            return JsonSerializer.Deserialize<HistoricalWeather?>(cached);

        var actuals = await inner.GetActualsAsync(latitude, longitude, date, ct);
        var options = actuals is null
            ? new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = MissTtl }
            : new DistributedCacheEntryOptions(); // immutable history — cache indefinitely
        await cache.SetStringAsync(key, JsonSerializer.Serialize(actuals), options, ct);
        return actuals;
    }
}
