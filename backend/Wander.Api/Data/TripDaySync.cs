using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>Keeps <see cref="Day"/> rows aligned with a trip's inclusive start/end dates.</summary>
internal static class TripDaySync
{
    public const int MaxDays = 60;

    public static List<(int DayNumber, DateOnly Date)> BuildRange(DateOnly start, DateOnly end)
    {
        if (end < start)
            return [];

        var days = new List<(int DayNumber, DateOnly Date)>();
        var dayNumber = 1;
        for (var date = start; date <= end && dayNumber <= MaxDays; date = date.AddDays(1), dayNumber++)
            days.Add((dayNumber, date));
        return days;
    }

    public static void Sync(WanderDbContext db, Trip trip, string ownerId)
    {
        var expected = BuildRange(trip.StartDate, trip.EndDate);
        var existing = db.Days
            .Where(d => d.TripId == trip.Id && d.OwnerId == ownerId && d.DeletedAt == null)
            .ToList();

        var expectedNumbers = expected.Select(e => e.DayNumber).ToHashSet();
        var now = DateTimeOffset.UtcNow;

        foreach (var (dayNumber, date) in expected)
        {
            var day = existing.FirstOrDefault(d => d.DayNumber == dayNumber);
            if (day is null)
            {
                db.Days.Add(new Day
                {
                    Id = Guid.NewGuid(),
                    TripId = trip.Id,
                    OwnerId = ownerId,
                    DayNumber = dayNumber,
                    Date = date,
                    CreatedAt = now,
                    UpdatedAt = now,
                });
            }
            else
            {
                day.Date = date;
                day.UpdatedAt = now;
            }
        }

        foreach (var extra in existing.Where(d => !expectedNumbers.Contains(d.DayNumber)))
        {
            extra.DeletedAt = now;
            extra.UpdatedAt = now;

            var items = db.ItineraryItems
                .Where(i => i.DayId == extra.Id && i.DeletedAt == null)
                .ToList();
            foreach (var item in items)
            {
                item.DeletedAt = now;
                item.UpdatedAt = now;
            }
        }
    }
}
