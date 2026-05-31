namespace Wander.Api.Places;

public interface IPlaceProvider
{
    /// <summary>Returns up to <paramref name="limit"/> place candidates matching the query.</summary>
    Task<IReadOnlyList<PlaceCandidate>> SearchAsync(string query, int limit, CancellationToken ct);

    /// <summary>Returns full details for a place, or <c>null</c> if not found.</summary>
    Task<PlaceDetails?> GetDetailsAsync(string placeId, CancellationToken ct);
}

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
