using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Wander.Api.Data;
using Wander.Api.Security;

namespace Wander.Api.Realtime;

/// <summary>Shared SignalR group/event vocabulary so the hub, notifier, and clients agree.</summary>
public static class TripRealtime
{
    public static string Group(Guid tripId) => $"trip-{tripId}";

    public const string PresenceEvent = "Presence";
    public const string TripChangedEvent = "TripChanged";
}

/// <summary>Payload broadcast when a trip's data changed, so peers can refresh.</summary>
public record TripChangedMessage(Guid TripId, string ChangeKind, string? ActorUserId);

/// <summary>Payload broadcast when the set of users present on a trip changes.</summary>
public record PresenceMessage(Guid TripId, IReadOnlyList<PresentUser> Present);

/// <summary>
/// Self-hosted SignalR hub for live trip co-editing (Phase 7, Slice 3). Clients call
/// <see cref="JoinTrip"/> after connecting; membership is access-checked so only owners/editors/
/// viewers of a trip can join its group and observe presence + change events.
/// </summary>
[Authorize]
public class TripHub(ITripAccessService access, ITripPresenceTracker presence) : Hub
{
    public async Task JoinTrip(Guid tripId)
    {
        var ownerId = Context.User?.GetUserId();
        if (ownerId is null)
            throw new HubException("Unauthorized.");

        if (access.Resolve(tripId, ownerId) is null)
            throw new HubException("No access to this trip.");

        await Groups.AddToGroupAsync(Context.ConnectionId, TripRealtime.Group(tripId));
        var present = presence.Join(tripId, Context.ConnectionId, ownerId, DisplayName());
        await BroadcastPresence(tripId, present);
    }

    public async Task LeaveTrip(Guid tripId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, TripRealtime.Group(tripId));
        var present = presence.Leave(tripId, Context.ConnectionId);
        await BroadcastPresence(tripId, present);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        foreach (var (tripId, present) in presence.Disconnect(Context.ConnectionId))
            await BroadcastPresence(tripId, present);

        await base.OnDisconnectedAsync(exception);
    }

    private Task BroadcastPresence(Guid tripId, IReadOnlyList<PresentUser> present) =>
        Clients.Group(TripRealtime.Group(tripId))
            .SendAsync(TripRealtime.PresenceEvent, new PresenceMessage(tripId, present));

    private string DisplayName() =>
        Context.User?.FindFirst("name")?.Value
        ?? Context.User?.FindFirst("preferred_username")?.Value
        ?? Context.User?.GetUserId()
        ?? "Traveler";
}
