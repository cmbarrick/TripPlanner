namespace Wander.Api.Weather;

/// <summary>
/// Deterministic fake weather provider for tests and local dev when no real provider is
/// configured. Returns a temperature derived from the month (warmer in summer) so the
/// output is plausible-looking without hitting any network.
/// </summary>
public class FakeWeatherProvider : IWeatherProvider
{
    public Task<WeatherObservation?> GetWeatherAsync(
        double latitude, double longitude, DateOnly date, CancellationToken ct)
    {
        // Summer months warmer; latitude shifts the baseline (colder near poles).
        var monthFactor = Math.Sin((date.Month - 1) * Math.PI / 11.0);
        var latitudeFactor = Math.Max(0, 1 - Math.Abs(latitude) / 90.0);
        var baseHigh = 8 + monthFactor * 22 * latitudeFactor;
        var high = Math.Round(baseHigh + (latitude % 3), 1);
        var low  = Math.Round(high - 8 - Math.Abs(longitude % 4), 1);

        // Simple WMO code cycle so the UI can render a variety of icons.
        var code = (date.DayOfYear % 5) switch
        {
            0 => 0,   // clear
            1 => 2,   // partly cloudy
            2 => 3,   // overcast
            3 => 61,  // rain
            _ => 1,   // mainly clear
        };

        var daysOut = date.DayNumber - DateOnly.FromDateTime(DateTime.UtcNow).DayNumber;
        return Task.FromResult<WeatherObservation?>(
            new WeatherObservation(high, low, code, IsClimateSummary: daysOut > 16));
    }
}
