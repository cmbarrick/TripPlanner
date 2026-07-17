namespace Wander.Api.Activities;

/// <summary>
/// No-key, no-network activity provider used in tests and when no real provider is configured.
/// A small hardcoded catalog near well-known European coordinates, so the full search → cite →
/// attach-a-real-link flow is exercisable without hitting Viator.
/// </summary>
public class FakeActivityProvider : IActivityProvider
{
    private static readonly ActivityOption[] Catalog =
    [
        new("fake_act_colosseum_tour", "Colosseum & Roman Forum Skip-the-Line Tour",
            "Guided walking tour through the Colosseum, Roman Forum, and Palatine Hill.",
            49.00m, "EUR", "https://www.viator.com/tours/Rome/fake-colosseum-tour/d511-fake001",
            "https://example.invalid/img/colosseum.jpg", 4.6),
        new("fake_act_paris_seine_cruise", "Seine River Evening Cruise",
            "One-hour boat cruise past the Eiffel Tower and Notre-Dame at sunset.",
            22.00m, "EUR", "https://www.viator.com/tours/Paris/fake-seine-cruise/d479-fake002",
            "https://example.invalid/img/seine.jpg", 4.4),
        new("fake_act_barcelona_sagrada", "Sagrada Família Fast-Track Entry",
            "Skip-the-line entry with an audio guide to Gaudí's basilica.",
            33.00m, "EUR", "https://www.viator.com/tours/Barcelona/fake-sagrada/d562-fake003",
            "https://example.invalid/img/sagrada.jpg", 4.7),
        new("fake_act_lisbon_tram", "Lisbon Tram 28 & Alfama Walking Tour",
            "Ride the historic tram and explore the Alfama district on foot.",
            18.50m, "EUR", "https://www.viator.com/tours/Lisbon/fake-tram-tour/d754-fake004",
            "https://example.invalid/img/lisbon-tram.jpg", 4.3),
        new("fake_act_athens_acropolis", "Acropolis & Acropolis Museum Combo",
            "Guided tour of the Acropolis followed by entry to the museum.",
            45.00m, "EUR", "https://www.viator.com/tours/Athens/fake-acropolis/d502-fake005",
            "https://example.invalid/img/acropolis.jpg", 4.8),
    ];

    public Task<IReadOnlyList<ActivityOption>> SearchAsync(
        string locationHint, DateOnly? date, string? query, string currency, int limit, CancellationToken ct)
    {
        // The fake catalog is tiny and not really geo/destination-indexed, so `locationHint` isn't
        // filtered on (a real provider keys search off it — see ViatorActivityProvider). Only the
        // explicit keyword `query` narrows results here; omitted, the tool still has something real
        // (if fake) to show rather than an empty catalog for an unmatched destination.
        var results = Catalog.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(query))
        {
            var q = query.Trim();
            results = results.Where(a =>
                a.Title.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                (a.Description?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false));
        }

        return Task.FromResult<IReadOnlyList<ActivityOption>>(results.Take(limit).ToList());
    }

    public Task<ActivityOption?> GetDetailsAsync(string activityId, CancellationToken ct)
    {
        var match = Catalog.FirstOrDefault(a => a.ActivityId == activityId);
        return Task.FromResult(match);
    }
}
