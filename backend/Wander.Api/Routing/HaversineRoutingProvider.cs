namespace Wander.Api.Routing;

/// <summary>
/// Straight-line (Haversine) distance with fixed urban speed assumptions.
/// No API key required. Used as the default provider and in CI.
/// Upgrade path: swap for <see cref="AzureMapsRoutingProvider"/> when a key is configured.
/// </summary>
public class HaversineRoutingProvider : IRoutingProvider
{
    private const double WalkKmh  = 5.0;
    private const double DriveKmh = 30.0; // conservative urban average

    public Task<TravelEstimate?> GetEstimateAsync(
        double originLat, double originLng,
        double destLat,   double destLng,
        CancellationToken ct)
    {
        var km      = Haversine(originLat, originLng, destLat, destLng);
        var walking = Math.Max(1, (int)Math.Round(km / WalkKmh  * 60));
        var driving = Math.Max(1, (int)Math.Round(km / DriveKmh * 60));
        return Task.FromResult<TravelEstimate?>(
            new TravelEstimate(Math.Round(km, 2), walking, driving));
    }

    internal static double Haversine(double lat1, double lng1, double lat2, double lng2)
    {
        const double R = 6371;
        static double ToRad(double d) => d * Math.PI / 180;
        var dLat = ToRad(lat2 - lat1);
        var dLng = ToRad(lng2 - lng1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
              + Math.Cos(ToRad(lat1)) * Math.Cos(ToRad(lat2))
              * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        return R * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }
}
