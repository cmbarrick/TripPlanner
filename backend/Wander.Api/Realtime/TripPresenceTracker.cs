using System.Collections.Concurrent;

namespace Wander.Api.Realtime;

/// <summary>A user currently present on a trip (collapsed across their connections).</summary>
public record PresentUser(string UserId, string DisplayName);

/// <summary>
/// In-memory presence for trip co-editing (Phase 7, Slice 3). Tracks which SignalR connections are
/// viewing which trip and collapses them to distinct users. Process-local by design: it is the
/// counterpart to the self-hosted <see cref="TripHub"/>. A future Azure Web PubSub backend would
/// replace both this tracker and the notifier with a distributed equivalent.
/// </summary>
public interface ITripPresenceTracker
{
    /// <summary>Records a connection as present on a trip. Returns the trip's distinct present users.</summary>
    IReadOnlyList<PresentUser> Join(Guid tripId, string connectionId, string userId, string displayName);

    /// <summary>Removes a connection from a trip. Returns the remaining present users.</summary>
    IReadOnlyList<PresentUser> Leave(Guid tripId, string connectionId);

    /// <summary>Removes a connection from every trip it joined. Returns the affected trips + their remaining users.</summary>
    IReadOnlyList<(Guid TripId, IReadOnlyList<PresentUser> Present)> Disconnect(string connectionId);

    IReadOnlyList<PresentUser> Present(Guid tripId);
}

public class TripPresenceTracker : ITripPresenceTracker
{
    private sealed record ConnectionInfo(string UserId, string DisplayName);

    // tripId -> (connectionId -> who). Nested dictionaries keep per-trip membership independent.
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<string, ConnectionInfo>> _byTrip = new();

    public IReadOnlyList<PresentUser> Join(Guid tripId, string connectionId, string userId, string displayName)
    {
        var connections = _byTrip.GetOrAdd(tripId, _ => new ConcurrentDictionary<string, ConnectionInfo>());
        connections[connectionId] = new ConnectionInfo(userId, displayName);
        return Distinct(connections);
    }

    public IReadOnlyList<PresentUser> Leave(Guid tripId, string connectionId)
    {
        if (!_byTrip.TryGetValue(tripId, out var connections))
            return [];

        connections.TryRemove(connectionId, out _);
        if (connections.IsEmpty)
            _byTrip.TryRemove(tripId, out _);

        return Distinct(connections);
    }

    public IReadOnlyList<(Guid TripId, IReadOnlyList<PresentUser> Present)> Disconnect(string connectionId)
    {
        var affected = new List<(Guid, IReadOnlyList<PresentUser>)>();
        foreach (var (tripId, connections) in _byTrip)
        {
            if (connections.TryRemove(connectionId, out _))
            {
                if (connections.IsEmpty)
                    _byTrip.TryRemove(tripId, out _);
                affected.Add((tripId, Distinct(connections)));
            }
        }
        return affected;
    }

    public IReadOnlyList<PresentUser> Present(Guid tripId) =>
        _byTrip.TryGetValue(tripId, out var connections) ? Distinct(connections) : [];

    private static IReadOnlyList<PresentUser> Distinct(ConcurrentDictionary<string, ConnectionInfo> connections) =>
        connections.Values
            .GroupBy(c => c.UserId)
            .Select(g => new PresentUser(g.Key, g.First().DisplayName))
            .OrderBy(u => u.DisplayName)
            .ToList();
}
