namespace Wander.Api.Weather;

/// <summary>
/// Weather **actuals** for past dates (recap grounding — architecture §7 "Two regimes").
/// Unlike <see cref="IWeatherProvider"/> (forecast/climate for planning), this returns the real
/// conditions on the exact date visited, so a recap can say "it was 34°C at the Valley of the
/// Temples" without hallucinating.
/// </summary>
public interface IHistoricalWeatherProvider
{
    /// <summary>
    /// Actual daily weather (plus hourly temperatures when available) for a past date at a
    /// location. Null for today/future dates or when the source has no data.
    /// </summary>
    Task<HistoricalWeather?> GetActualsAsync(double latitude, double longitude, DateOnly date, CancellationToken ct);
}

/// <summary>Observed conditions on a specific past day. <paramref name="Hours"/> is local-time
/// hourly temperatures (empty when unavailable) so event recaps can reference the conditions at
/// the event's start time.</summary>
public record HistoricalWeather(
    double HighC,
    double LowC,
    int WeatherCode,
    IReadOnlyList<HourlyPoint> Hours);
