using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

public class WanderDbContext(DbContextOptions<WanderDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Preference> Preferences => Set<Preference>();
    public DbSet<ConsentSetting> ConsentSettings => Set<ConsentSetting>();
    public DbSet<Trip> Trips => Set<Trip>();
    public DbSet<Day> Days => Set<Day>();
    public DbSet<ItineraryItem> ItineraryItems => Set<ItineraryItem>();
    public DbSet<PackingItem> PackingItems => Set<PackingItem>();
    public DbSet<TripMember> TripMembers => Set<TripMember>();
    public DbSet<TripShare> TripShares => Set<TripShare>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(x => x.OwnerId).IsUnique();
            entity.HasIndex(x => x.SubjectId).IsUnique();
            entity.HasIndex(x => x.Email).IsUnique();
        });

        modelBuilder.Entity<Preference>(entity =>
        {
            entity.HasIndex(x => x.UserId).IsUnique();
            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ConsentSetting>(entity =>
        {
            entity.ToTable("consent_settings");
            entity.HasIndex(x => x.UserId).IsUnique();
            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Trip>(entity =>
        {
            entity.HasIndex(x => x.OwnerId);
            entity.HasMany(x => x.Days)
                .WithOne()
                .HasForeignKey(x => x.TripId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Day>(entity =>
        {
            entity.HasIndex(x => new { x.TripId, x.DayNumber }).IsUnique();
            entity.HasMany(x => x.Items)
                .WithOne()
                .HasForeignKey(x => x.DayId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.PackingItems)
                .WithOne()
                .HasForeignKey(x => x.DayId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ItineraryItem>(entity =>
        {
            entity.HasIndex(x => new { x.DayId, x.SortOrder });
        });

        modelBuilder.Entity<PackingItem>(entity =>
        {
            entity.ToTable("packing_items");
            entity.HasIndex(x => new { x.DayId, x.Name });
        });

        modelBuilder.Entity<TripMember>(entity =>
        {
            entity.ToTable("trip_members");
            entity.HasIndex(x => new { x.TripId, x.UserId }).IsUnique();
            entity.HasOne<Trip>()
                .WithMany()
                .HasForeignKey(x => x.TripId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<TripShare>(entity =>
        {
            entity.ToTable("trip_shares");
            entity.HasIndex(x => x.TripId);
            entity.HasIndex(x => x.Token).IsUnique();
            entity.HasOne<Trip>()
                .WithMany()
                .HasForeignKey(x => x.TripId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
