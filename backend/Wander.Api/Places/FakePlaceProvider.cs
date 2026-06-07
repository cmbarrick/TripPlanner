namespace Wander.Api.Places;

/// <summary>
/// No-key, no-network place provider used in tests and when no real provider is configured.
/// Returns a small hardcoded set of European landmarks so the full flow is exercisable without
/// hitting any external API.
/// </summary>
public class FakePlaceProvider : IPlaceProvider
{
    private static readonly PlaceDetails[] Catalog =
    [
        new("fake_eiffel_tower",     "Eiffel Tower",            "Champ de Mars, Paris, France",              48.858370,  2.294481),
        new("fake_colosseum",        "Colosseum",               "Piazza del Colosseo, Rome, Italy",          41.890209,  12.492231),
        new("fake_sagrada_familia",  "Sagrada Família",         "Carrer de Mallorca 401, Barcelona, Spain",  41.403629,  2.174356),
        new("fake_acropolis",        "Acropolis of Athens",     "Acropolis Hill, Athens, Greece",            37.971534,  23.726749),
        new("fake_agrigento",        "Valley of the Temples",   "Via Passeggiata Archeologica, Agrigento",   37.291300,  13.588200),
        new("fake_taormina",         "Taormina",                "Taormina, Metropolitan City of Messina",    37.851600,  15.289300),
        new("fake_belem_tower",      "Belém Tower",             "Av. Brasília, Lisbon, Portugal",            38.691670, -9.215880),
        new("fake_alhambra",         "Alhambra Palace",         "Calle Real de la Alhambra, Granada, Spain", 37.176100, -3.588200),
    ];

    public Task<IReadOnlyList<PlaceCandidate>> SearchAsync(string query, int limit, PlaceSearchOptions options, CancellationToken ct)
    {
        var q = query.Trim();
        var results = Catalog
            .Where(p =>
                p.Name.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                (p.Address?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false))
            .Take(limit)
            .Select(p => new PlaceCandidate(p.PlaceId, p.Name, p.Address, p.Latitude, p.Longitude))
            .ToList();

        return Task.FromResult<IReadOnlyList<PlaceCandidate>>(results);
    }

    public Task<PlaceDetails?> GetDetailsAsync(string placeId, string? sessionToken, CancellationToken ct)
    {
        var detail = Catalog.FirstOrDefault(p => p.PlaceId == placeId);
        return Task.FromResult(detail);
    }
}
