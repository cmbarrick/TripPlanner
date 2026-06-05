using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Wander.Api.Weather;

/// <summary>
/// Calls Open-Meteo — free, no API key required.
/// <list type="bullet">
///   <item>≤ 16 days out: live forecast  (api.open-meteo.com/v1/forecast)</item>
///   <item>Further out or past: historical archive from one year prior, labeled as a climate
///         summary (archive-api.open-meteo.com/v1/archive).</item>
/// </list>
/// </summary>
public class OpenMeteoWeatherProvider(HttpClient http) : IWeatherProvider
{
    private const string ForecastBase = "https://api.open-meteo.com/v1/forecast";
    private const string ArchiveBase  = "https://archive-api.open-meteo.com/v1/archive";
    private const int    ForecastWindow = 16;
    private const string DailyFields  = "temperature_2m_max,temperature_2m_min,weather_code";
    // Archive has no precipitation *probability*, so it's only requested for live forecasts.
    private const string HourlyForecastFields = "temperature_2m,weather_code,precipitation_probability";
    private const string HourlyArchiveFields  = "temperature_2m,weather_code";

    public async Task<WeatherObservation?> GetWeatherAsync(
        double latitude, double longitude, DateOnly date, CancellationToken ct)
    {
        var today   = DateOnly.FromDateTime(DateTime.UtcNow);
        var daysOut = date.DayNumber - today.DayNumber;

        if (daysOut >= -1 && daysOut <= ForecastWindow)
            return await FetchForecastAsync(latitude, longitude, date, ct);

        // For far-future or past dates, use the same calendar date one year ago so the
        // numbers reflect real weather at that location in that season.
        var archiveDate = date.AddYears(-1);
        // Archive is only available up to ~5 days ago; clamp if needed.
        var latestArchive = today.AddDays(-5);
        if (archiveDate > latestArchive) archiveDate = latestArchive;

        return await FetchArchiveAsync(latitude, longitude, archiveDate, ct);
    }

    public async Task<HourlyWeather?> GetHourlyAsync(
        double latitude, double longitude, DateOnly date, CancellationToken ct)
    {
        var today   = DateOnly.FromDateTime(DateTime.UtcNow);
        var daysOut = date.DayNumber - today.DayNumber;

        if (daysOut >= -1 && daysOut <= ForecastWindow)
            return await FetchHourlyAsync(ForecastBase, latitude, longitude, date, HourlyForecastFields, isClimateSummary: false, ct);

        var archiveDate = date.AddYears(-1);
        var latestArchive = today.AddDays(-5);
        if (archiveDate > latestArchive) archiveDate = latestArchive;

        return await FetchHourlyAsync(ArchiveBase, latitude, longitude, archiveDate, HourlyArchiveFields, isClimateSummary: true, ct);
    }

    private async Task<HourlyWeather?> FetchHourlyAsync(
        string baseUrl, double lat, double lng, DateOnly date, string hourlyFields, bool isClimateSummary, CancellationToken ct)
    {
        // timezone=auto returns the hourly "time" array in the location's local time so the UI can
        // line each hour up with the event's local start time.
        var url = $"{baseUrl}?latitude={lat}&longitude={lng}" +
                  $"&hourly={hourlyFields}&timezone=auto" +
                  $"&start_date={date:yyyy-MM-dd}&end_date={date:yyyy-MM-dd}";

        var root = await http.GetFromJsonAsync<OpenMeteoHourly>(url, ct);
        var times = root?.Hourly?.Time;
        var temps = root?.Hourly?.Temperature;
        if (times is null || temps is null || times.Length == 0) return null;

        var codes  = root!.Hourly!.WeatherCode;
        var precip = root.Hourly.PrecipitationProbability;

        var points = new List<HourlyPoint>(times.Length);
        for (var i = 0; i < times.Length && i < temps.Length; i++)
        {
            points.Add(new HourlyPoint(
                times[i],
                Math.Round(temps[i], 1),
                codes is not null && i < codes.Length ? codes[i] : 0,
                precip is not null && i < precip.Length ? precip[i] : null));
        }

        return new HourlyWeather(isClimateSummary, points);
    }

    private async Task<WeatherObservation?> FetchForecastAsync(
        double lat, double lng, DateOnly date, CancellationToken ct)
    {
        var url = $"{ForecastBase}?latitude={lat}&longitude={lng}" +
                  $"&daily={DailyFields}&timezone=UTC" +
                  $"&start_date={date:yyyy-MM-dd}&end_date={date:yyyy-MM-dd}";

        var root = await http.GetFromJsonAsync<OpenMeteoDaily>(url, ct);
        return Parse(root, isClimateSummary: false);
    }

    private async Task<WeatherObservation?> FetchArchiveAsync(
        double lat, double lng, DateOnly date, CancellationToken ct)
    {
        var url = $"{ArchiveBase}?latitude={lat}&longitude={lng}" +
                  $"&daily={DailyFields}&timezone=UTC" +
                  $"&start_date={date:yyyy-MM-dd}&end_date={date:yyyy-MM-dd}";

        var root = await http.GetFromJsonAsync<OpenMeteoDaily>(url, ct);
        return Parse(root, isClimateSummary: true);
    }

    private static WeatherObservation? Parse(OpenMeteoDaily? root, bool isClimateSummary)
    {
        var high = root?.Daily?.TemperatureMax?.FirstOrDefault();
        var low  = root?.Daily?.TemperatureMin?.FirstOrDefault();
        var code = root?.Daily?.WeatherCode?.FirstOrDefault() ?? 0;
        if (high is null || low is null) return null;
        return new WeatherObservation(
            Math.Round(high.Value, 1), Math.Round(low.Value, 1), code, isClimateSummary);
    }

    // ── Minimal Open-Meteo response shapes ───────────────────────────────────

    private record OpenMeteoDaily(
        [property: JsonPropertyName("daily")] DailyBlock? Daily);

    private record DailyBlock(
        [property: JsonPropertyName("temperature_2m_max")] double[]? TemperatureMax,
        [property: JsonPropertyName("temperature_2m_min")] double[]? TemperatureMin,
        [property: JsonPropertyName("weather_code")]       int[]?    WeatherCode);

    private record OpenMeteoHourly(
        [property: JsonPropertyName("hourly")] HourlyBlock? Hourly);

    private record HourlyBlock(
        [property: JsonPropertyName("time")]                     string[]? Time,
        [property: JsonPropertyName("temperature_2m")]           double[]? Temperature,
        [property: JsonPropertyName("weather_code")]            int[]?    WeatherCode,
        [property: JsonPropertyName("precipitation_probability")] int[]?  PrecipitationProbability);
}
