namespace Wander.Api.Routing;

public interface IRoutingProvider
{
    /// <summary>
    /// Returns travel estimates between two points for walking and driving.
    /// Returns <c>null</c> if the provider is unavailable.
    /// </summary>
    Task<TravelEstimate?> GetEstimateAsync(
        double originLat, double originLng,
        double destLat,   double destLng,
        CancellationToken ct);
}

public record TravelEstimate(
    double DistanceKm,
    int    WalkingMinutes,
    int    DrivingMinutes);
