using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;

namespace Wander.Api.Places;

/// <summary>
/// Calls the Mapbox Search Box API. Autocomplete uses interactive <c>suggest</c> (best POI recall —
/// hotels, restaurants, attractions — with optional proximity bias toward the trip area); the chosen
/// suggestion is resolved to coordinates with <c>retrieve</c>. Suggest + retrieve share a session
/// token so they bill as one Search Box session. Reads the access token from
/// <c>Places:MapboxAccessToken</c> in configuration (env var / user-secrets / Key Vault).
/// Never surfaces the token to clients — it stays server-side.
/// </summary>
public class MapboxPlaceProvider : IPlaceProvider
{
    private const string BaseUrl = "https://api.mapbox.com/search/searchbox/v1";

    // Feature types relevant to a trip stop. Search Box (unlike Geocoding v6) supports "poi".
    private const string Types = "poi,address,street,place,locality,neighborhood";

    private readonly HttpClient _http;
    private readonly string _token;

    public MapboxPlaceProvider(HttpClient http, IConfiguration config)
    {
        _http = http;
        _token = config["Places:MapboxAccessToken"]
            ?? throw new InvalidOperationException("Places:MapboxAccessToken must be configured.");
    }

    public async Task<IReadOnlyList<PlaceCandidate>> SearchAsync(string query, int limit, PlaceSearchOptions options, CancellationToken ct)
    {
        // "suggest" is the interactive autocomplete: it returns ranked suggestions (incl. POIs) but
        // NOT coordinates — those come from a follow-up retrieve(placeId) using the same session.
        var session = string.IsNullOrWhiteSpace(options.SessionToken) ? Guid.NewGuid().ToString() : options.SessionToken!;
        var url = $"{BaseUrl}/suggest?q={Uri.EscapeDataString(query)}&limit={limit}&types={Types}&session_token={Uri.EscapeDataString(session)}&access_token={_token}";
        if (options is { ProximityLng: not null, ProximityLat: not null })
            url += $"&proximity={options.ProximityLng.Value.ToString(CultureInfo.InvariantCulture)},{options.ProximityLat.Value.ToString(CultureInfo.InvariantCulture)}";

        var root = await _http.GetFromJsonAsync<MapboxSuggestResponse>(url, ct);
        if (root?.Suggestions is null)
            return [];

        return root.Suggestions
            .Select(s => new PlaceCandidate(
                PlaceId: s.MapboxId ?? string.Empty,
                Name: s.Name ?? string.Empty,
                // Suggestions have no coordinates; resolve via GetDetailsAsync on selection.
                Address: s.FullAddress ?? s.PlaceFormatted,
                Latitude: null,
                Longitude: null))
            .Where(c => !string.IsNullOrWhiteSpace(c.PlaceId) && !string.IsNullOrWhiteSpace(c.Name))
            .ToList();
    }

    public async Task<PlaceDetails?> GetDetailsAsync(string placeId, string? sessionToken, CancellationToken ct)
    {
        // "retrieve" resolves a suggestion's mapbox_id to a feature with coordinates. Reuse the
        // session token from the suggest calls so the pair bills as a single Search Box session.
        var session = string.IsNullOrWhiteSpace(sessionToken) ? Guid.NewGuid().ToString() : sessionToken!;
        var url = $"{BaseUrl}/retrieve/{Uri.EscapeDataString(placeId)}?session_token={Uri.EscapeDataString(session)}&access_token={_token}";
        var root = await _http.GetFromJsonAsync<MapboxFeatureCollection>(url, ct);
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

    // Minimal Search Box "suggest" response: a list of suggestions (no geometry).
    private record MapboxSuggestResponse(
        [property: JsonPropertyName("suggestions")] List<MapboxSuggestion>? Suggestions);

    private record MapboxSuggestion(
        [property: JsonPropertyName("mapbox_id")] string? MapboxId,
        [property: JsonPropertyName("name")] string? Name,
        [property: JsonPropertyName("full_address")] string? FullAddress,
        [property: JsonPropertyName("place_formatted")] string? PlaceFormatted);

    // Minimal Search Box "retrieve" response (GeoJSON FeatureCollection; geometry carries [lng, lat]).
    private record MapboxFeatureCollection(
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
