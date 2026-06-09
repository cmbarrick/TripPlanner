using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

public class PreferenceService(WanderDbContext db) : IPreferenceService
{
    public async Task<Preference> GetOrCreateAsync(string ownerId, CancellationToken ct = default)
    {
        var existing = await db.Preferences
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.OwnerId == ownerId && x.DeletedAt == null, ct);
        if (existing is not null)
            return existing;

        var user = await db.Users.SingleOrDefaultAsync(x => x.OwnerId == ownerId && x.DeletedAt == null, ct);
        if (user is null)
        {
            user = new User
            {
                OwnerId = ownerId,
                SubjectId = ownerId,
                Email = DevEmail(ownerId),
                DisplayName = "Traveler",
            };
            db.Users.Add(user);
            await db.SaveChangesAsync(ct);
        }

        var preference = new Preference
        {
            OwnerId = ownerId,
            UserId = user.Id,
        };
        db.Preferences.Add(preference);
        await db.SaveChangesAsync(ct);
        return preference;
    }

    public async Task<Preference> UpdateAsync(string ownerId, PreferenceUpdate update, CancellationToken ct = default)
    {
        ValidateUpdate(update);

        var preference = await db.Preferences
            .SingleOrDefaultAsync(x => x.OwnerId == ownerId && x.DeletedAt == null, ct);
        if (preference is null)
        {
            await GetOrCreateAsync(ownerId, ct);
            preference = await db.Preferences
                .SingleAsync(x => x.OwnerId == ownerId && x.DeletedAt == null, ct);
        }

        if (update.TemperatureUnit is not null)
            preference.TemperatureUnit = TravelPreferenceValues.Normalize(update.TemperatureUnit, TravelPreferenceValues.TemperatureUnits);
        if (update.DistanceUnit is not null)
            preference.DistanceUnit = TravelPreferenceValues.Normalize(update.DistanceUnit, TravelPreferenceValues.DistanceUnits);
        if (update.Currency is not null)
            preference.Currency = update.Currency.Trim().ToUpperInvariant();
        if (update.TravelStyle is not null)
            preference.TravelStyle = TravelPreferenceValues.Normalize(update.TravelStyle, TravelPreferenceValues.TravelStyles);
        if (update.Pace is not null)
            preference.Pace = TravelPreferenceValues.Normalize(update.Pace, TravelPreferenceValues.Paces);
        if (update.Diet is not null)
            preference.Diet = TravelPreferenceValues.Normalize(update.Diet, TravelPreferenceValues.Diets);
        if (update.BudgetBand is not null)
            preference.BudgetBand = TravelPreferenceValues.Normalize(update.BudgetBand, TravelPreferenceValues.BudgetBands);

        preference.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return preference;
    }

    private static void ValidateUpdate(PreferenceUpdate update)
    {
        if (update.TemperatureUnit is not null && !TravelPreferenceValues.TemperatureUnits.Contains(update.TemperatureUnit))
            throw new ArgumentException("Invalid temperature unit.");
        if (update.DistanceUnit is not null && !TravelPreferenceValues.DistanceUnits.Contains(update.DistanceUnit))
            throw new ArgumentException("Invalid distance unit.");
        if (update.Currency is not null && string.IsNullOrWhiteSpace(update.Currency))
            throw new ArgumentException("Currency is required.");
        if (update.TravelStyle is not null && !TravelPreferenceValues.TravelStyles.Contains(update.TravelStyle))
            throw new ArgumentException("Invalid travel style.");
        if (update.Pace is not null && !TravelPreferenceValues.Paces.Contains(update.Pace))
            throw new ArgumentException("Invalid pace.");
        if (update.Diet is not null && !TravelPreferenceValues.Diets.Contains(update.Diet))
            throw new ArgumentException("Invalid diet.");
        if (update.BudgetBand is not null && !TravelPreferenceValues.BudgetBands.Contains(update.BudgetBand))
            throw new ArgumentException("Invalid budget band.");
    }

    private static string DevEmail(string ownerId)
    {
        var local = ownerId.Replace('@', '_').Replace(' ', '_');
        if (local.Length > 120)
            local = local[..120];
        return $"{local}@users.wander";
    }
}
