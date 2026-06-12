using Microsoft.EntityFrameworkCore;
using Wander.Api.Ai;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Recaps;
using Wander.Api.Weather;

namespace Wander.Api.Tests;

public class RecapPromptBuilderTests
{
    [Fact]
    public void LabelNotes_FlattensTextAndTranscripts_SkipsEmpty()
    {
        var notes = new List<Note>
        {
            new() { BodyText = "Loved the market.", CreatedAt = DateTimeOffset.UtcNow.AddHours(-2) },
            new()
            {
                Kind = NoteKind.Voice,
                CreatedAt = DateTimeOffset.UtcNow.AddHours(-1),
                MediaAssets = [new MediaAsset { Kind = MediaAssetKind.Audio, Transcript = "The sunset was unreal." }],
            },
            new() { Kind = NoteKind.Voice, CreatedAt = DateTimeOffset.UtcNow }, // no transcript yet → skipped
        };

        var labeled = RecapPromptBuilder.LabelNotes(notes, _ => "whole trip");

        Assert.Equal(2, labeled.Count);
        Assert.Equal("n1", labeled[0].Label);
        Assert.Contains("Loved the market.", labeled[0].Text);
        Assert.Equal("n2", labeled[1].Label);
        Assert.Contains("(Voice transcript) The sunset was unreal.", labeled[1].Text);
    }

    [Fact]
    public void LabelNotes_IncludesPromptQuestion()
    {
        var notes = new List<Note>
        {
            new() { Kind = NoteKind.PromptResponse, PromptText = "Favorite meal?", BodyText = "The arancini." },
        };

        var labeled = RecapPromptBuilder.LabelNotes(notes, _ => "Day 1");

        Assert.Single(labeled);
        Assert.Contains("Favorite meal?", labeled[0].Text);
        Assert.Contains("The arancini.", labeled[0].Text);
    }

    [Fact]
    public void FormatContext_ContainsGroundingSections()
    {
        var trip = new Trip { Title = "Sicily", Destination = "Sicily, Italy" };
        var labeled = new List<RecapPromptBuilder.LabeledNote>
        {
            new("n1", Guid.NewGuid(), "Day 1", "Great granita."),
        };

        var context = RecapPromptBuilder.FormatContext(
            trip, RecapScope.Trip, "the whole trip",
            ["Day 1 (2026-06-01): Beach"],
            labeled,
            ["2026-06-01 at Beach: high 30°C, low 21°C, clear sky"]);

        Assert.Contains("Recap scope: the whole trip", context);
        Assert.Contains("[n1] (Day 1) Great granita.", context);
        Assert.Contains("Actual weather", context);
        Assert.Contains("ONLY source of experiences", context);
    }
}

public class RecapValidatorTests
{
    [Fact]
    public void ParseAndValidate_MapsLabelsToNoteIds_DropsUnknown()
    {
        var n1 = Guid.NewGuid();
        var json = """
            {"title":"My recap","sections":[
              {"heading":"Day 1","body":"We swam.","noteIds":["n1","n9"]}
            ]}
            """;

        var parsed = RecapValidator.ParseAndValidate(json, new Dictionary<string, Guid> { ["n1"] = n1 });

        Assert.Equal("My recap", parsed.Title);
        var section = Assert.Single(parsed.Sections);
        Assert.Equal([n1], section.NoteIds); // n9 was hallucinated → dropped
    }

    [Fact]
    public void ParseAndValidate_MalformedJson_Throws()
    {
        Assert.Throws<RecapParseException>(() =>
            RecapValidator.ParseAndValidate("{not json", new Dictionary<string, Guid>()));
    }

    [Fact]
    public void ParseAndValidate_NoSections_Throws()
    {
        Assert.Throws<RecapParseException>(() =>
            RecapValidator.ParseAndValidate("""{"title":"x","sections":[]}""", new Dictionary<string, Guid>()));
    }

    [Fact]
    public void ComposeBody_JoinsSectionsAsMarkdown()
    {
        var body = RecapValidator.ComposeBody(
        [
            new RecapSectionDto("Day 1", "We swam.", []),
            new RecapSectionDto("", "Then home.", []),
        ]);

        Assert.Contains("## Day 1", body);
        Assert.Contains("We swam.", body);
        Assert.Contains("Then home.", body);
        Assert.DoesNotContain("## \n", body);
    }
}

public class RecapGenerationServiceTests
{
    private const string OwnerId = "owner-user";

    [Fact]
    public async Task GenerateAsync_GroundsOnNotes_PersistsDraftWithCitations()
    {
        await using var db = NewDb();
        var trip = SeedTrip(db);
        var note1 = SeedNote(db, trip, "Loved the market.");
        var note2 = SeedNote(db, trip, "The pasta was incredible.");

        var svc = BuildService(db, new FakeAiProvider());
        var recap = await svc.GenerateAsync(
            OwnerId, trip.Id, new GenerateRecapRequest(RecapScope.Trip, null, RecapTone.Narrative));

        Assert.Equal("A sample trip recap", recap.Title);
        Assert.Equal(RecapStatus.Draft, recap.Status);
        Assert.Equal(1, recap.Version);
        Assert.True(recap.TokensUsed > 0);
        Assert.Equal([note1.Id, note2.Id], recap.GeneratedFromNoteIds.OrderBy(id => id == note2.Id ? 1 : 0).ToList());

        // Sample cites n1 and n2 — both must resolve to the real note ids.
        var sections = RecapMapper.ParseSections(recap.SectionsJson);
        Assert.Equal(2, sections.Count);
        Assert.All(sections.SelectMany(s => s.NoteIds), id => Assert.Contains(id, new[] { note1.Id, note2.Id }));

        Assert.Single(db.Recaps);
        Assert.Single(db.AiTokenUsages);
    }

    [Fact]
    public async Task GenerateAsync_NoNotesInScope_Throws()
    {
        await using var db = NewDb();
        var trip = SeedTrip(db);
        var svc = BuildService(db, new FakeAiProvider());

        await Assert.ThrowsAsync<RecapNoSourceNotesException>(() =>
            svc.GenerateAsync(OwnerId, trip.Id, new GenerateRecapRequest(RecapScope.Trip, null, RecapTone.Narrative)));
    }

    [Fact]
    public async Task GenerateAsync_TripNotOwned_Throws()
    {
        await using var db = NewDb();
        var trip = SeedTrip(db);
        SeedNote(db, trip, "Hello.");
        var svc = BuildService(db, new FakeAiProvider());

        await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            svc.GenerateAsync("other-user", trip.Id, new GenerateRecapRequest(RecapScope.Trip, null, RecapTone.Narrative)));
    }

    [Fact]
    public async Task GenerateAsync_UnchangedSources_ReturnsExistingDraftWithoutSpendingTokens()
    {
        await using var db = NewDb();
        var trip = SeedTrip(db);
        SeedNote(db, trip, "Loved the market.");
        var svc = BuildService(db, new FakeAiProvider());
        var request = new GenerateRecapRequest(RecapScope.Trip, null, RecapTone.Narrative);

        var first = await svc.GenerateAsync(OwnerId, trip.Id, request);
        var tokensAfterFirst = db.AiTokenUsages.AsEnumerable().Sum(u => u.TotalTokens);
        var second = await svc.GenerateAsync(OwnerId, trip.Id, request);

        Assert.Equal(first.Id, second.Id);
        Assert.Single(db.Recaps);
        Assert.Equal(tokensAfterFirst, db.AiTokenUsages.AsEnumerable().Sum(u => u.TotalTokens));
    }

    [Fact]
    public async Task GenerateAsync_EditedNote_RegeneratesNewRecap()
    {
        await using var db = NewDb();
        var trip = SeedTrip(db);
        var note = SeedNote(db, trip, "Loved the market.");
        var svc = BuildService(db, new FakeAiProvider());
        var request = new GenerateRecapRequest(RecapScope.Trip, null, RecapTone.Narrative);

        var first = await svc.GenerateAsync(OwnerId, trip.Id, request);
        note.BodyText = "Loved the market and the harbor.";
        note.UpdatedAt = note.UpdatedAt.AddMinutes(5);
        await db.SaveChangesAsync();

        var second = await svc.GenerateAsync(OwnerId, trip.Id, request);

        Assert.NotEqual(first.Id, second.Id);
        Assert.Equal(2, db.Recaps.Count());
    }

    [Fact]
    public async Task GenerateAsync_EventScope_OnlyUsesThatEventsNotes()
    {
        await using var db = NewDb();
        var trip = SeedTrip(db);
        var item = trip.Days[0].Items[0];
        SeedNote(db, trip, "Trip-level reflection.");
        var eventNote = SeedNote(db, trip, "The cathedral was stunning.", NoteScope.Event, item.Id);

        var capturing = new CapturingRecapProvider();
        var svc = BuildService(db, capturing);
        var recap = await svc.GenerateAsync(
            OwnerId, trip.Id, new GenerateRecapRequest(RecapScope.Event, item.Id, RecapTone.Highlights));

        Assert.Equal([eventNote.Id], recap.GeneratedFromNoteIds);
        var user = capturing.LastRequest!.Messages.First(m => m.Role == AiRole.User).Content ?? "";
        Assert.Contains("The cathedral was stunning.", user);
        Assert.DoesNotContain("Trip-level reflection.", user);
    }

    [Fact]
    public async Task GenerateAsync_PastLocatedStop_InjectsActualWeatherIntoPrompt()
    {
        await using var db = NewDb();
        var trip = SeedTrip(db, daysAgo: 30); // past trip
        SeedNote(db, trip, "Hot day at the temples.");

        var capturing = new CapturingRecapProvider();
        var svc = BuildService(db, capturing, new FakeHistoricalWeatherProvider());
        await svc.GenerateAsync(OwnerId, trip.Id, new GenerateRecapRequest(RecapScope.Trip, null, RecapTone.Narrative));

        var user = capturing.LastRequest!.Messages.First(m => m.Role == AiRole.User).Content ?? "";
        Assert.Contains("Actual weather", user);
        Assert.Contains("high 27.5°C", user);
        Assert.Contains("around 10:00 it was", user); // hourly fact for the timed stop
    }

    [Fact]
    public async Task GenerateAsync_FutureTrip_NoWeatherFacts()
    {
        await using var db = NewDb();
        var trip = SeedTrip(db, daysAgo: -30); // future trip
        SeedNote(db, trip, "Planning thoughts.");

        var capturing = new CapturingRecapProvider();
        var svc = BuildService(db, capturing, new FakeHistoricalWeatherProvider());
        await svc.GenerateAsync(OwnerId, trip.Id, new GenerateRecapRequest(RecapScope.Trip, null, RecapTone.Narrative));

        var user = capturing.LastRequest!.Messages.First(m => m.Role == AiRole.User).Content ?? "";
        Assert.DoesNotContain("Actual weather", user);
    }

    [Fact]
    public async Task GenerateAsync_QuotaExhausted_Throws()
    {
        await using var db = NewDb();
        var trip = SeedTrip(db);
        SeedNote(db, trip, "Loved the market.");
        var quota = new AiTokenQuotaService(
            db, Microsoft.Extensions.Options.Options.Create(new AiOptions { DailyTokenLimit = 0 }));
        var svc = new RecapGenerationService(
            new FakeAiProvider(), new EfCoreTripRepository(db), new EfCoreNoteRepository(db),
            new EfCoreRecapRepository(db), new FakeHistoricalWeatherProvider(), quota);

        await Assert.ThrowsAsync<AiQuotaExceededException>(() =>
            svc.GenerateAsync(OwnerId, trip.Id, new GenerateRecapRequest(RecapScope.Trip, null, RecapTone.Narrative)));
    }

    private static RecapGenerationService BuildService(
        WanderDbContext db, IAiProvider provider, IHistoricalWeatherProvider? weather = null) =>
        new(
            provider,
            new EfCoreTripRepository(db),
            new EfCoreNoteRepository(db),
            new EfCoreRecapRepository(db),
            weather ?? new FakeHistoricalWeatherProvider(),
            new AiTokenQuotaService(
                db, Microsoft.Extensions.Options.Options.Create(new AiOptions { DailyTokenLimit = 50_000 })));

    private static WanderDbContext NewDb() =>
        new(new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static Trip SeedTrip(WanderDbContext db, int daysAgo = 10)
    {
        var start = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-daysAgo);
        var trip = new Trip
        {
            OwnerId = OwnerId,
            Title = "Sicily",
            Destination = "Sicily, Italy",
            StartDate = start,
            EndDate = start.AddDays(1),
            Currency = "EUR",
            Days =
            [
                new Day
                {
                    OwnerId = OwnerId,
                    DayNumber = 1,
                    Date = start,
                    Items =
                    [
                        new ItineraryItem
                        {
                            OwnerId = OwnerId,
                            Title = "Valley of the Temples",
                            LocationName = "Agrigento",
                            Latitude = 37.29,
                            Longitude = 13.59,
                            StartTime = new TimeOnly(10, 0),
                        },
                    ],
                },
            ],
        };
        db.Trips.Add(trip);
        db.SaveChanges();
        foreach (var day in trip.Days)
        {
            foreach (var item in day.Items)
                item.TripId = trip.Id;
        }
        db.SaveChanges();
        return trip;
    }

    private static Note SeedNote(
        WanderDbContext db, Trip trip, string body,
        NoteScope scope = NoteScope.Trip, Guid? targetId = null)
    {
        var note = new Note
        {
            TripId = trip.Id,
            OwnerId = OwnerId,
            Scope = scope,
            TargetId = targetId,
            BodyText = body,
        };
        db.Notes.Add(note);
        db.SaveChanges();
        return note;
    }

    private sealed class CapturingRecapProvider : IAiProvider
    {
        public bool IsEnabled => true;
        public AiCompletionRequest? LastRequest { get; private set; }

        public async IAsyncEnumerable<AiCompletionDelta> CompleteAsync(
            AiCompletionRequest request,
            [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
        {
            LastRequest = request;
            await Task.CompletedTask;
            yield return new TextDelta(FakeAiProvider.SampleRecapJson);
            yield return new CompletionDone(new AiUsage(20, 30), AiFinishReason.Stop);
        }
    }
}

public class RecapRepositoryTests
{
    private const string OwnerId = "owner-user";

    [Fact]
    public void UpdateDraft_BumpsVersion()
    {
        using var db = NewDb();
        var (trip, recap) = Seed(db);
        var repo = new EfCoreRecapRepository(db);

        var updated = repo.UpdateDraft(recap.Id, OwnerId, "New title", "Edited body");

        Assert.NotNull(updated);
        Assert.Equal(2, updated!.Version);
        Assert.Equal("Edited body", updated.Body);
    }

    [Fact]
    public void UpdateDraft_NotOwner_ReturnsNull()
    {
        using var db = NewDb();
        var (_, recap) = Seed(db);
        var repo = new EfCoreRecapRepository(db);

        Assert.Null(repo.UpdateDraft(recap.Id, "other-user", "x", "y"));
    }

    [Fact]
    public void Finalize_SetsStatusFinal()
    {
        using var db = NewDb();
        var (_, recap) = Seed(db);
        var repo = new EfCoreRecapRepository(db);

        Assert.Equal(RecapStatus.Final, repo.Finalize(recap.Id, OwnerId)!.Status);
    }

    [Fact]
    public void EnsureShareToken_IsIdempotent_AndRecordsExportUrl()
    {
        using var db = NewDb();
        var (_, recap) = Seed(db);
        var repo = new EfCoreRecapRepository(db);

        var first = repo.EnsureShareToken(recap.Id, OwnerId, RecapMapper.ShareUrl)!;
        var second = repo.EnsureShareToken(recap.Id, OwnerId, RecapMapper.ShareUrl)!;

        Assert.False(string.IsNullOrEmpty(first.ShareToken));
        Assert.Equal(first.ShareToken, second.ShareToken);
        Assert.Single(second.ExportUrls);
        Assert.Equal($"/share/recaps/{first.ShareToken}", second.ExportUrls[0]);
        Assert.Same(second, repo.GetByShareToken(first.ShareToken!));
    }

    [Fact]
    public void Delete_SoftDeletes_AndHidesFromQueries()
    {
        using var db = NewDb();
        var (trip, recap) = Seed(db);
        var repo = new EfCoreRecapRepository(db);

        Assert.True(repo.Delete(recap.Id, OwnerId));
        Assert.Null(repo.GetById(recap.Id, OwnerId));
        Assert.Empty(repo.GetForTrip(trip.Id, OwnerId));
        Assert.NotNull(db.Recaps.Single().DeletedAt);
    }

    [Fact]
    public void GetForTrip_NotOwner_ReturnsEmpty()
    {
        using var db = NewDb();
        var (trip, _) = Seed(db);
        var repo = new EfCoreRecapRepository(db);

        Assert.Empty(repo.GetForTrip(trip.Id, "other-user"));
    }

    private static (Trip Trip, Recap Recap) Seed(WanderDbContext db)
    {
        var trip = new Trip { OwnerId = OwnerId, Title = "Sicily", Destination = "Sicily, Italy" };
        db.Trips.Add(trip);
        db.SaveChanges();

        var repo = new EfCoreRecapRepository(db);
        var recap = repo.Add(trip.Id, OwnerId, new Recap
        {
            Scope = RecapScope.Trip,
            Tone = RecapTone.Narrative,
            Title = "Draft",
            Body = "Body",
        })!;
        return (trip, recap);
    }

    private static WanderDbContext NewDb() =>
        new(new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
}

public class HistoricalWeatherCachingTests
{
    [Fact]
    public async Task GetActualsAsync_CachesIndefinitely()
    {
        var inner = new CountingProvider();
        var cache = new Microsoft.Extensions.Caching.Distributed.MemoryDistributedCache(
            Microsoft.Extensions.Options.Options.Create(
                new Microsoft.Extensions.Caching.Memory.MemoryDistributedCacheOptions()));
        var provider = new CachingHistoricalWeatherProvider(inner, cache);
        var date = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-30);

        var first = await provider.GetActualsAsync(37.29, 13.59, date, CancellationToken.None);
        var second = await provider.GetActualsAsync(37.291, 13.591, date, CancellationToken.None); // ~same km

        Assert.NotNull(first);
        Assert.Equal(first!.HighC, second!.HighC);
        Assert.Equal(1, inner.Calls);
    }

    private sealed class CountingProvider : IHistoricalWeatherProvider
    {
        public int Calls { get; private set; }

        public Task<HistoricalWeather?> GetActualsAsync(
            double latitude, double longitude, DateOnly date, CancellationToken ct)
        {
            Calls++;
            return Task.FromResult<HistoricalWeather?>(new HistoricalWeather(30, 20, 0, []));
        }
    }
}
