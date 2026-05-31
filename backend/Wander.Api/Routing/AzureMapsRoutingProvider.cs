using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Wander.Api.Routing;

/// <summary>
/// Calls the Azure Maps Route API for real road-network travel times.
/// Activated when <c>Routing:AzureMapsKey</c> is present in configuration.
/// Falls back gracefully to Haversine estimates on network failure.
/// </summary>
public class AzureMapsRoutingProvider(HttpClient http, string apiKey) : IRoutingProvider
{
    // Azure Maps Route Matrix — synchronous, two points, two travel modes.
    private const string BaseUrl = "https://atlas.microsoft.com/route/directions/json";

    public async Task<TravelEstimate?> GetEstimateAsync(
        double originLat, double originLng,
        double destLat,   double destLng,
        CancellationToken ct)
    {
        try
        {
            var driving = await FetchMinutes(originLat, originLng, destLat, destLng, "car", ct);
            var walking = await FetchMinutes(originLat, originLng, destLat, destLng, "pedestrian", ct);
            var km      = HaversineRoutingProvider.Haversine(originLat, originLng, destLat, destLng);
            return new TravelEstimate(Math.Round(km, 2), walking ?? 0, driving ?? 0);
        }
        catch
        {
            // Network / quota failure — fall back to Haversine.
            return await new HaversineRoutingProvider()
                .GetEstimateAsync(originLat, originLng, destLat, destLng, ct);
        }
    }

    private async Task<int?> FetchMinutes(
        double oLat, double oLng, double dLat, double dLng,
        string travelMode, CancellationToken ct)
    {
        var url = $"{BaseUrl}?api-version=1.0&subscription-key={apiKey}" +
                  $"&query={oLat},{oLng}:{dLat},{dLng}" +
                  $"&travelMode={travelMode}";

        var root = await http.GetFromJsonAsync<AzureRouteResponse>(url, ct);
        var seconds = root?.Routes?.FirstOrDefault()?.Summary?.TravelTimeInSeconds;
        return seconds.HasValue ? (int)Math.Ceiling(seconds.Value / 60.0) : null;
    }

    private record AzureRouteResponse(
        [property: JsonPropertyName("routes")] List<AzureRoute>? Routes);

    private record AzureRoute(
        [property: JsonPropertyName("summary")] AzureRouteSummary? Summary);

    private record AzureRouteSummary(
        [property: JsonPropertyName("travelTimeInSeconds")] double? TravelTimeInSeconds,
        [property: JsonPropertyName("lengthInMeters")]      int?    LengthInMeters);
}
