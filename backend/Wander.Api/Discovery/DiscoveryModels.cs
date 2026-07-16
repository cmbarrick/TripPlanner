namespace Wander.Api.Discovery;

public enum DiscoveryAnswerStatus
{
    Answered,
    /// <summary>No public recap matched the question closely enough (empty retrieval), or the
    /// model itself judged the retrieved excerpts didn't actually answer it.</summary>
    NoSource
}

/// <summary>A public recap the answer drew from — enough to render a link and "clone this trip" affordance.</summary>
public record DiscoveryCitation(
    Guid PublicRecapId,
    Guid RecapId,
    Guid TripId,
    string Title,
    IReadOnlyList<string> Places);

public record DiscoveryAnswer(
    DiscoveryAnswerStatus Status,
    string? Answer,
    IReadOnlyList<DiscoveryCitation> Citations,
    int TokensUsed);

public sealed class DiscoveryParseException : Exception
{
    public DiscoveryParseException(string message) : base(message) { }
}
