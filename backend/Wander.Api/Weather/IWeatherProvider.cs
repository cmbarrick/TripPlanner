namespace Wander.Api.Weather;

public interface IWeatherProvider
{
    /// <summary>
    /// Returns a weather observation for the given location and date, or <c>null</c>
    /// if the provider cannot supply data (e.g. date out of range, network failure).
    /// </summary>
    Task<WeatherObservation?> GetWeatherAsync(double latitude, double longitude, DateOnly date, CancellationToken ct);

    /// <summary>
    /// Returns the full day's hourly forecast for the given location and date, or <c>null</c>
    /// when the provider can't supply it. Times are in the location's local time zone so the UI
    /// can line them up with the event's local start time. Hourly data is display-only (not
    /// persisted) — see architecture §7.
    /// </summary>
    Task<HourlyWeather?> GetHourlyAsync(double latitude, double longitude, DateOnly date, CancellationToken ct);
}

/// <summary>A single day's weather at a specific location.</summary>
public record WeatherObservation(
    double HighC,
    double LowC,
    /// <summary>WMO Weather Interpretation Code (0 = clear, 3 = overcast, 61 = rain, etc.).</summary>
    int WeatherCode,
    /// <summary>
    /// True when this is a historical/climate estimate rather than a live forecast.
    /// The UI labels it "typical for this time of year".
    /// </summary>
    bool IsClimateSummary);

/// <summary>A day's worth of hourly weather at a specific location (local time).</summary>
public record HourlyWeather(
    bool IsClimateSummary,
    IReadOnlyList<HourlyPoint> Hours);

/// <summary>A single hour's weather. <paramref name="Time"/> is local ISO ("2026-07-01T14:00").</summary>
public record HourlyPoint(
    string Time,
    double TemperatureC,
    int WeatherCode,
    /// <summary>Chance of precipitation 0–100, or null when the source doesn't provide it (archive).</summary>
    int? PrecipitationProbability);
