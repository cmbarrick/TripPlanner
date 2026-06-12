using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Wander.Api.Weather;

/// <summary>
/// Actuals for past dates from Open-Meteo. The archive (archive-api.open-meteo.com/v1/archive)
/// lags ~5 days behind real time, so very recent past dates fall back to the forecast endpoint,
/// which also serves recent history. One call fetches daily + hourly together so a cached entry
/// covers both granularities.
/// </summary>
public class OpenMeteoHistoricalWeatherProvider(HttpClient http) : IHistoricalWeatherProvider
{
    private const string ForecastBase = "https://api.open-meteo.com/v1/forecast";
    private const string ArchiveBase  = "https://archive-api.open-meteo.com/v1/archive";
    /// <summary>Days the archive trails behind today.</summary>
    private const int ArchiveLagDays = 5;

    public async Task<HistoricalWeather?> GetActualsAsync(
        double latitude, double longitude, DateOnly date, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (date >= today)
            return null; // actuals only — planning weather is IWeatherProvider's job

        var baseUrl = date > today.AddDays(-ArchiveLagDays) ? ForecastBase : ArchiveBase;

        // timezone=auto keeps the hourly "time" axis in the location's local time so event start
        // times line up.
        var url = $"{baseUrl}?latitude={latitude}&longitude={longitude}" +
                  "&daily=temperature_2m_max,temperature_2m_min,weather_code" +
                  "&hourly=temperature_2m,weather_code&timezone=auto" +
                  $"&start_date={date:yyyy-MM-dd}&end_date={date:yyyy-MM-dd}";

        OpenMeteoResponse? root;
        try
        {
            root = await http.GetFromJsonAsync<OpenMeteoResponse>(url, ct);
        }
        catch (HttpRequestException)
        {
            return null; // weather is additive context; recap generation proceeds without it
        }

        var high = root?.Daily?.TemperatureMax?.FirstOrDefault();
        var low  = root?.Daily?.TemperatureMin?.FirstOrDefault();
        if (high is null || low is null)
            return null;

        var hours = new List<HourlyPoint>();
        var times = root!.Hourly?.Time;
        var temps = root.Hourly?.Temperature;
        if (times is not null && temps is not null)
        {
            var codes = root.Hourly!.WeatherCode;
            for (var i = 0; i < times.Length && i < temps.Length; i++)
            {
                hours.Add(new HourlyPoint(
                    times[i],
                    Math.Round(temps[i], 1),
                    codes is not null && i < codes.Length ? codes[i] : 0,
                    null));
            }
        }

        return new HistoricalWeather(
            Math.Round(high.Value, 1),
            Math.Round(low.Value, 1),
            root.Daily?.WeatherCode?.FirstOrDefault() ?? 0,
            hours);
    }

    // ── Minimal Open-Meteo response shapes ───────────────────────────────────

    private record OpenMeteoResponse(
        [property: JsonPropertyName("daily")]  DailyBlock?  Daily,
        [property: JsonPropertyName("hourly")] HourlyBlock? Hourly);

    private record DailyBlock(
        [property: JsonPropertyName("temperature_2m_max")] double[]? TemperatureMax,
        [property: JsonPropertyName("temperature_2m_min")] double[]? TemperatureMin,
        [property: JsonPropertyName("weather_code")]       int[]?    WeatherCode);

    private record HourlyBlock(
        [property: JsonPropertyName("time")]           string[]? Time,
        [property: JsonPropertyName("temperature_2m")] double[]? Temperature,
        [property: JsonPropertyName("weather_code")]   int[]?    WeatherCode);
}
