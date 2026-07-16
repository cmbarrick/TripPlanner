using Wander.Api.Realtime;

namespace Wander.Api.Tests;

/// <summary>Phase 7, Slice 3: in-memory presence tracking for realtime trip co-editing.</summary>
public class TripPresenceTrackerTests
{
    [Fact]
    public void Join_TracksDistinctUsers_CollapsingMultipleConnections()
    {
        var tracker = new TripPresenceTracker();
        var trip = Guid.NewGuid();

        tracker.Join(trip, "conn-1", "alice", "Alice");
        var present = tracker.Join(trip, "conn-2", "alice", "Alice"); // same user, 2nd device
        Assert.Single(present);

        present = tracker.Join(trip, "conn-3", "bob", "Bob");
        Assert.Equal(2, present.Count);
        Assert.Contains(present, p => p.UserId == "alice");
        Assert.Contains(present, p => p.UserId == "bob");
    }

    [Fact]
    public void Leave_RemovesUserOnlyWhenLastConnectionGone()
    {
        var tracker = new TripPresenceTracker();
        var trip = Guid.NewGuid();
        tracker.Join(trip, "conn-1", "alice", "Alice");
        tracker.Join(trip, "conn-2", "alice", "Alice");
        tracker.Join(trip, "conn-3", "bob", "Bob");

        var present = tracker.Leave(trip, "conn-1");
        Assert.Equal(2, present.Count); // alice still has conn-2

        present = tracker.Leave(trip, "conn-2");
        Assert.Single(present); // alice fully gone
        Assert.Equal("bob", present[0].UserId);
    }

    [Fact]
    public void Disconnect_RemovesConnectionFromEveryTrip()
    {
        var tracker = new TripPresenceTracker();
        var tripA = Guid.NewGuid();
        var tripB = Guid.NewGuid();
        tracker.Join(tripA, "conn-1", "alice", "Alice");
        tracker.Join(tripB, "conn-1", "alice", "Alice");
        tracker.Join(tripB, "conn-2", "bob", "Bob");

        var affected = tracker.Disconnect("conn-1");

        Assert.Equal(2, affected.Count);
        Assert.Empty(tracker.Present(tripA));
        var tripBNow = tracker.Present(tripB);
        Assert.Single(tripBNow);
        Assert.Equal("bob", tripBNow[0].UserId);
    }

    [Fact]
    public void Present_IsEmptyForUnknownTrip()
    {
        var tracker = new TripPresenceTracker();
        Assert.Empty(tracker.Present(Guid.NewGuid()));
    }
}
