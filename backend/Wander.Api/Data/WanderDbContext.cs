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
    public DbSet<Note> Notes => Set<Note>();
    public DbSet<MediaAsset> MediaAssets => Set<MediaAsset>();
    public DbSet<AiTokenUsage> AiTokenUsages => Set<AiTokenUsage>();
    public DbSet<Recap> Recaps => Set<Recap>();
    public DbSet<Reaction> Reactions => Set<Reaction>();
    public DbSet<PublicRecap> PublicRecaps => Set<PublicRecap>();
    public DbSet<PublicRecapReport> PublicRecapReports => Set<PublicRecapReport>();
    public DbSet<EmbeddingChunk> EmbeddingChunks => Set<EmbeddingChunk>();

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
            MapXminConcurrencyToken(entity);
        });

        modelBuilder.Entity<Day>(entity =>
        {
            entity.HasIndex(x => new { x.TripId, x.DayNumber }).IsUnique();
            // DayId is nullable on items (null = trip backlog); deleting a day sends its items to the
            // backlog rather than deleting them. We soft-delete in practice, so this rarely fires.
            entity.HasMany(x => x.Items)
                .WithOne()
                .HasForeignKey(x => x.DayId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasMany(x => x.PackingItems)
                .WithOne()
                .HasForeignKey(x => x.DayId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ItineraryItem>(entity =>
        {
            // TripId is a durable scalar link (no navigation); indexed with DayId/SortOrder so both
            // day agendas and the backlog query (DayId == null) stay fast.
            entity.HasIndex(x => new { x.TripId, x.DayId, x.SortOrder });
            MapXminConcurrencyToken(entity);
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

        modelBuilder.Entity<Note>(entity =>
        {
            entity.ToTable("notes");
            // Event/day journaling queries filter by (trip, scope, target); owner index guards listing.
            entity.HasIndex(x => new { x.TripId, x.Scope, x.TargetId });
            entity.HasIndex(x => x.OwnerId);
            entity.HasOne<Trip>()
                .WithMany()
                .HasForeignKey(x => x.TripId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.MediaAssets)
                .WithOne()
                .HasForeignKey(x => x.NoteId)
                .OnDelete(DeleteBehavior.Cascade);
            MapXminConcurrencyToken(entity);
        });

        modelBuilder.Entity<MediaAsset>(entity =>
        {
            entity.ToTable("media_assets");
            entity.HasIndex(x => x.NoteId);
        });

        modelBuilder.Entity<AiTokenUsage>(entity =>
        {
            entity.ToTable("ai_token_usage");
            entity.HasIndex(x => new { x.OwnerId, x.UsageDate }).IsUnique();
        });

        modelBuilder.Entity<Reaction>(entity =>
        {
            entity.ToTable("reactions");
            // Listing pulls every reaction for a trip; the per-target index keeps grouping fast.
            entity.HasIndex(x => new { x.TripId, x.TargetType, x.TargetId });
            // One active reaction per (target, user, emoji) — enforced in code via revive-on-toggle
            // because soft delete means the row may linger; this index just keeps lookups fast.
            entity.HasIndex(x => new { x.TargetType, x.TargetId, x.OwnerId, x.Emoji });
            entity.HasOne<Trip>()
                .WithMany()
                .HasForeignKey(x => x.TripId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Recap>(entity =>
        {
            entity.ToTable("recaps");
            // Listing filters by (trip, scope, target); the share token is the anonymous lookup key.
            entity.HasIndex(x => new { x.TripId, x.Scope, x.TargetId });
            entity.HasIndex(x => x.OwnerId);
            entity.HasIndex(x => x.ShareToken).IsUnique();
            entity.HasOne<Trip>()
                .WithMany()
                .HasForeignKey(x => x.TripId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PublicRecap>(entity =>
        {
            entity.ToTable("public_recaps");
            // One active publish row per recap; re-publishing revives it (see PublicRecapService).
            entity.HasIndex(x => x.RecapId).IsUnique();
            entity.HasIndex(x => x.OwnerId);
            // Discovery listing (Slice 2) filters approved + non-revoked recaps.
            entity.HasIndex(x => new { x.ModerationStatus, x.DeletedAt });
            entity.HasOne<Recap>()
                .WithMany()
                .HasForeignKey(x => x.RecapId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PublicRecapReport>(entity =>
        {
            entity.ToTable("public_recap_reports");
            entity.HasIndex(x => new { x.PublicRecapId, x.Status });
            entity.HasOne<PublicRecap>()
                .WithMany()
                .HasForeignKey(x => x.PublicRecapId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EmbeddingChunk>(entity =>
        {
            entity.ToTable("embedding_chunks");
            // One chunk per (source, sourceId) today — re-indexing updates it in place.
            entity.HasIndex(x => new { x.Source, x.SourceId }).IsUnique();
        });
    }

    /// <summary>
    /// Maps an entity's <c>Version</c> property onto Postgres's <c>xmin</c> system column — every
    /// row already has one, auto-incremented by Postgres on every update, so this needs no new
    /// column or backfill. EF Core includes it in the UPDATE's <c>WHERE</c> clause and throws
    /// <see cref="Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException"/> if the row moved
    /// since the caller read it (see <see cref="ConcurrencyConflictException"/>, which repositories
    /// translate that into). Entity types that opt in must declare <c>public uint Version { get; set; }</c>.
    /// </summary>
    private static void MapXminConcurrencyToken<T>(Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<T> entity)
        where T : class
    {
        entity.Property<uint>("Version")
            .HasColumnName("xmin")
            .HasColumnType("xid")
            .ValueGeneratedOnAddOrUpdate()
            .IsConcurrencyToken();
    }
}
