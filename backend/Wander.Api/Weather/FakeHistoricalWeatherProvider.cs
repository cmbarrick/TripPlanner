namespace Wander.Api.Weather;

/// <summary>Deterministic actuals for CI/integration tests (<c>Weather:UseFake=true</c>). Never
/// calls the network.</summary>
public class FakeHistoricalWeatherProvider : IHistoricalWeatherProvider
{
    public Task<HistoricalWeather?> GetActualsAsync(
        double latitude, double longitude, DateOnly date, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (date >= today)
            return Task.FromResult<HistoricalWeather?>(null);

        var hours = Enumerable.Range(0, 24)
            .Select(h => new HourlyPoint($"{date:yyyy-MM-dd}T{h:00}:00", 18 + h % 8, 1, null))
            .ToList();
        return Task.FromResult<HistoricalWeather?>(new HistoricalWeather(27.5, 16.0, 1, hours));
    }
}
