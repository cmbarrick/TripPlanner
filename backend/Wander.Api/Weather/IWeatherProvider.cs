namespace Wander.Api.Weather;

public interface IWeatherProvider
{
    /// <summary>
    /// Returns a weather observation for the given location and date, or <c>null</c>
    /// if the provider cannot supply data (e.g. date out of range, network failure).
    /// </summary>
    Task<WeatherObservation?> GetWeatherAsync(double latitude, double longitude, DateOnly date, CancellationToken ct);
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
