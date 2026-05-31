using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;

namespace Wander.Api.Places;

/// <summary>
/// Calls the Mapbox Geocoding API v6. Reads the access token from
/// <c>Places:MapboxAccessToken</c> in configuration (env var / user-secrets / Key Vault).
/// Never surfaces the token to clients — it stays server-side.
/// </summary>
public class MapboxPlaceProvider : IPlaceProvider
{
    private const string BaseUrl = "https://api.mapbox.com/search/geocode/v6";

    private readonly HttpClient _http;
    private readonly string _token;

    public MapboxPlaceProvider(HttpClient http, IConfiguration config)
    {
        _http = http;
        _token = config["Places:MapboxAccessToken"]
            ?? throw new InvalidOperationException("Places:MapboxAccessToken must be configured.");
    }

    public async Task<IReadOnlyList<PlaceCandidate>> SearchAsync(string query, int limit, CancellationToken ct)
    {
        var url = $"{BaseUrl}/forward?q={Uri.EscapeDataString(query)}&limit={limit}&types=poi,address,place&access_token={_token}";
        var root = await _http.GetFromJsonAsync<MapboxForwardResponse>(url, ct);
        if (root?.Features is null)
            return [];

        return root.Features
            .Select(f => new PlaceCandidate(
                PlaceId: f.Properties?.MapboxId ?? f.Id ?? string.Empty,
                Name: f.Properties?.Name ?? string.Empty,
                Address: f.Properties?.FullAddress ?? f.Properties?.PlaceFormatted,
                Latitude: f.Geometry?.Coordinates?.ElementAtOrDefault(1),
                Longitude: f.Geometry?.Coordinates?.ElementAtOrDefault(0)))
            .Where(c => !string.IsNullOrWhiteSpace(c.PlaceId) && !string.IsNullOrWhiteSpace(c.Name))
            .ToList();
    }

    public async Task<PlaceDetails?> GetDetailsAsync(string placeId, CancellationToken ct)
    {
        var url = $"{BaseUrl}/retrieve/{Uri.EscapeDataString(placeId)}?access_token={_token}";
        var root = await _http.GetFromJsonAsync<MapboxForwardResponse>(url, ct);
        var f = root?.Features?.FirstOrDefault();
        if (f is null)
            return null;

        var lat = f.Geometry?.Coordinates?.ElementAtOrDefault(1);
        var lng = f.Geometry?.Coordinates?.ElementAtOrDefault(0);
        if (lat is null || lng is null)
            return null;

        return new PlaceDetails(
            PlaceId: f.Properties?.MapboxId ?? f.Id ?? placeId,
            Name: f.Properties?.Name ?? string.Empty,
            Address: f.Properties?.FullAddress ?? f.Properties?.PlaceFormatted,
            Latitude: lat.Value,
            Longitude: lng.Value);
    }

    // Minimal Mapbox Geocoding API v6 response shapes.
    private record MapboxForwardResponse(
        [property: JsonPropertyName("features")] List<MapboxFeature>? Features);

    private record MapboxFeature(
        [property: JsonPropertyName("id")] string? Id,
        [property: JsonPropertyName("geometry")] MapboxGeometry? Geometry,
        [property: JsonPropertyName("properties")] MapboxProperties? Properties);

    private record MapboxGeometry(
        [property: JsonPropertyName("coordinates")] double[]? Coordinates);

    private record MapboxProperties(
        [property: JsonPropertyName("mapbox_id")] string? MapboxId,
        [property: JsonPropertyName("name")] string? Name,
        [property: JsonPropertyName("full_address")] string? FullAddress,
        [property: JsonPropertyName("place_formatted")] string? PlaceFormatted);
}
