namespace Wander.Api.Places;

public interface IPlaceProvider
{
    /// <summary>Returns up to <paramref name="limit"/> place candidates matching the query.</summary>
    Task<IReadOnlyList<PlaceCandidate>> SearchAsync(string query, int limit, PlaceSearchOptions options, CancellationToken ct);

    /// <summary>Returns full details for a place, or <c>null</c> if not found.</summary>
    Task<PlaceDetails?> GetDetailsAsync(string placeId, string? sessionToken, CancellationToken ct);
}

/// <summary>
/// Per-search hints for the provider. <see cref="SessionToken"/> groups an autocomplete
/// session's suggest calls + the final retrieve into one billed Search Box session; the
/// proximity point biases results toward where the traveler is planning (e.g. the trip area).
/// All optional — providers ignore what they don't use.
/// </summary>
public readonly record struct PlaceSearchOptions(
    string? SessionToken = null,
    double? ProximityLng = null,
    double? ProximityLat = null);

/// <summary>A lightweight autocomplete suggestion returned by <see cref="IPlaceProvider.SearchAsync"/>.</summary>
public record PlaceCandidate(
    string PlaceId,
    string Name,
    string? Address,
    double? Latitude,
    double? Longitude);

/// <summary>Full structured details for a resolved place.</summary>
public record PlaceDetails(
    string PlaceId,
    string Name,
    string? Address,
    double Latitude,
    double Longitude);
