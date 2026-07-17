namespace Wander.Api.Activities;

/// <summary>
/// Real, bookable tour/activity options near a location (Phase 9: itinerary options). The AI
/// planning assistant's `searchActivities` tool calls <see cref="SearchAsync"/> to show the
/// traveler real choices; if they add one to the itinerary, `addItineraryItem` passes the chosen
/// <see cref="ActivityOption.ActivityId"/> back through <see cref="GetDetailsAsync"/> so the
/// server — never the model — is what attaches the real booking URL. The model can reference an
/// id; it can never type a URL, price, or title into existence (see
/// <c>Ai/AiToolSchemas.cs</c>/<c>Ai/AiToolExecutor.cs</c>).
/// </summary>
public interface IActivityProvider
{
    /// <summary>Up to <paramref name="limit"/> bookable activities near <paramref name="locationHint"/>
    /// (a place/destination name — Viator's search keys off a search term, not raw coordinates,
    /// same as most tour-inventory APIs). <paramref name="date"/>, when known, biases toward
    /// availability on that day; <paramref name="query"/> is an optional keyword filter (e.g. "walking
    /// tour"); <paramref name="currency"/> is the trip's currency (ISO 4217, e.g. "EUR") so
    /// <see cref="ActivityOption.PriceFrom"/> is directly usable as the item's cost.</summary>
    Task<IReadOnlyList<ActivityOption>> SearchAsync(
        string locationHint, DateOnly? date, string? query, string currency, int limit, CancellationToken ct);

    /// <summary>Re-resolves a single activity by the id a prior search returned — the only path
    /// that's allowed to produce a <see cref="ActivityOption.BookingUrl"/> the server trusts.
    /// Null if the id is unknown or the activity is no longer bookable.</summary>
    Task<ActivityOption?> GetDetailsAsync(string activityId, CancellationToken ct);
}

/// <summary>A real, currently-bookable activity. Every field here came from the provider, never
/// from the model.</summary>
public record ActivityOption(
    string ActivityId,
    string Title,
    string? Description,
    decimal? PriceFrom,
    string? Currency,
    string BookingUrl,
    string? ImageUrl,
    double? Rating);
