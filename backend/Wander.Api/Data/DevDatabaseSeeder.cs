namespace Wander.Api.Data;

public static class DevDatabaseSeeder
{
    public static void Seed(WanderDbContext dbContext, IConfiguration configuration)
    {
        var enabled = configuration.GetValue<bool?>("DevelopmentSeed:Enabled") ?? true;
        if (!enabled)
        {
            return;
        }

        var ownerId = configuration["Authentication:DevBypass:DefaultUserId"] ?? "local-dev-user";

        // Idempotent by title: seed any template trips this owner is missing. This means existing
        // local databases pick up newly added sample trips (e.g. the Sicily plan) without
        // duplicating trips that are already there.
        var existingTitles = dbContext.Trips
            .Where(t => t.OwnerId == ownerId && t.DeletedAt == null)
            .Select(t => t.Title)
            .ToHashSet();

        var missing = SeedData.CreateTripsForOwner(ownerId)
            .Where(t => !existingTitles.Contains(t.Title))
            .ToList();

        if (missing.Count == 0)
        {
            return;
        }

        dbContext.Trips.AddRange(missing);
        dbContext.SaveChanges();
    }
}
