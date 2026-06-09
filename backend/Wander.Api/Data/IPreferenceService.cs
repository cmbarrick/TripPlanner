using Wander.Api.Models;

namespace Wander.Api.Data;

public interface IPreferenceService
{
    Task<Preference> GetOrCreateAsync(string ownerId, CancellationToken ct = default);

    Task<Preference> UpdateAsync(string ownerId, PreferenceUpdate update, CancellationToken ct = default);
}

/// <summary>Partial update — only non-null fields are applied.</summary>
public sealed record PreferenceUpdate(
    string? TemperatureUnit = null,
    string? DistanceUnit = null,
    string? Currency = null,
    string? TravelStyle = null,
    string? Pace = null,
    string? Diet = null,
    string? BudgetBand = null);
