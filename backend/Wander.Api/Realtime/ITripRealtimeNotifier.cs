using Microsoft.AspNetCore.SignalR;

namespace Wander.Api.Realtime;

/// <summary>
/// Broadcasts trip changes to connected peers. This is the seam between the application (controllers)
/// and the realtime transport: today a self-hosted SignalR hub, swappable for Azure Web PubSub later
/// without touching callers.
/// </summary>
public interface ITripRealtimeNotifier
{
    /// <summary>
    /// Notifies everyone viewing <paramref name="tripId"/> that its data changed. Fire-and-forget:
    /// a realtime hiccup must never fail the underlying write that already succeeded.
    /// </summary>
    void NotifyTripChanged(Guid tripId, string changeKind, string? actorUserId = null);
}

public class SignalRTripRealtimeNotifier(
    IHubContext<TripHub> hub,
    ILogger<SignalRTripRealtimeNotifier> logger) : ITripRealtimeNotifier
{
    public void NotifyTripChanged(Guid tripId, string changeKind, string? actorUserId = null)
    {
        // The HTTP write has already committed; broadcasting is best-effort and must not throw
        // into the request path, so it runs detached with its own error handling.
        _ = Task.Run(async () =>
        {
            try
            {
                await hub.Clients.Group(TripRealtime.Group(tripId))
                    .SendAsync(TripRealtime.TripChangedEvent, new TripChangedMessage(tripId, changeKind, actorUserId));
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to broadcast TripChanged for trip {TripId}", tripId);
            }
        });
    }
}
