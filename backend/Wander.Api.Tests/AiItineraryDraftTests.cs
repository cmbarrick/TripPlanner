using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wander.Api.Ai;
using Wander.Api.Controllers;
using Wander.Api.Data;
using Wander.Api.Models;

namespace Wander.Api.Tests;

public class AiDraftValidatorTests
{
    [Fact]
    public void ParseAndValidate_ValidPayload_ReturnsItems()
    {
        var trip = SampleTrip();
        var json = FakeAiProvider.SampleDraftJson;

        var draft = AiDraftValidator.ParseAndValidate(json, trip);

        Assert.Equal("Sample draft itinerary", draft.Summary);
        Assert.Equal(2, draft.Items.Count);
        Assert.Equal("09:00:00", draft.Items[0].StartTime);
        Assert.Equal("Activity", draft.Items[0].Type);
    }

    [Fact]
    public void ParseAndValidate_InvalidDayNumber_Throws()
    {
        var trip = SampleTrip();
        var json = """
            {"summary":"x","items":[{"dayNumber":9,"type":"Activity","title":"Late","startTime":null,"endTime":null,"locationName":null,"address":null,"cost":null,"notes":null}]}
            """;

        Assert.Throws<AiDraftParseException>(() => AiDraftValidator.ParseAndValidate(json, trip));
    }

    [Fact]
    public void ParseAndValidate_InvalidTime_Throws()
    {
        var trip = SampleTrip();
        var json = """
            {"summary":"x","items":[{"dayNumber":1,"type":"Activity","title":"Bad time","startTime":"25:99","endTime":null,"locationName":null,"address":null,"cost":null,"notes":null}]}
            """;

        Assert.Throws<AiDraftParseException>(() => AiDraftValidator.ParseAndValidate(json, trip));
    }

    private static Trip SampleTrip() =>
        new()
        {
            Id = Guid.NewGuid(),
            Title = "Lisbon",
            Destination = "Lisbon, Portugal",
            StartDate = new DateOnly(2026, 6, 10),
            EndDate = new DateOnly(2026, 6, 12),
            Currency = "EUR",
            Days =
            [
                new Day { DayNumber = 1, Date = new DateOnly(2026, 6, 10) },
                new Day { DayNumber = 2, Date = new DateOnly(2026, 6, 11) },
            ],
        };
}

public class AiItineraryDraftServiceTests
{
    private const string OwnerId = "owner-user";

    [Fact]
    public async Task GenerateAsync_WithFakeProvider_ReturnsDraftAndRecordsQuota()
    {
        await using var db = NewDb();
        var trip = SeedTrip(db);
        var svc = BuildService(db, new FakeAiProvider());

        var result = await svc.GenerateAsync(
            OwnerId,
            trip.Id,
            new GenerateItineraryRequest("Plan a relaxed foodie day"),
            CancellationToken.None);

        Assert.Equal(2, result.Items.Count);
        Assert.True(result.TokensUsed > 0);
        Assert.Single(db.AiTokenUsages);
    }

    [Fact]
    public async Task GenerateAsync_TripNotOwned_Throws()
    {
        await using var db = NewDb();
        var trip = SeedTrip(db);
        var svc = BuildService(db, new FakeAiProvider());

        await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            svc.GenerateAsync("other-user", trip.Id, new GenerateItineraryRequest("Plan"), CancellationToken.None));
    }

    [Fact]
    public async Task GenerateAsync_ShortPrompt_Throws()
    {
        await using var db = NewDb();
        var trip = SeedTrip(db);
        var svc = BuildService(db, new FakeAiProvider());

        await Assert.ThrowsAsync<ArgumentException>(() =>
            svc.GenerateAsync(OwnerId, trip.Id, new GenerateItineraryRequest("hi"), CancellationToken.None));
    }

    [Fact]
    public async Task GenerateAsync_UsesStoredPreferences_InPrompt()
    {
        await using var db = NewDb();
        var trip = SeedTrip(db);
        var user = new User { OwnerId = OwnerId, SubjectId = OwnerId, Email = "a@users.wander", DisplayName = "A" };
        db.Users.Add(user);
        db.Preferences.Add(new Preference
        {
            OwnerId = OwnerId,
            UserId = user.Id,
            TravelStyle = "foodie",
            Pace = "relaxed",
        });
        await db.SaveChangesAsync();

        var capturing = new CapturingAiProvider();
        var svc = BuildService(db, capturing);
        await svc.GenerateAsync(OwnerId, trip.Id, new GenerateItineraryRequest("Plan day 1"), CancellationToken.None);

        var system = capturing.LastRequest!.Messages.First(m => m.Role == AiRole.System).Content ?? "";
        Assert.Contains("foodie", system);
        Assert.Contains("Lisbon", system);
    }

    private static AiItineraryDraftService BuildService(WanderDbContext db, IAiProvider provider) =>
        new(provider, new EfCoreTripRepository(db), new PreferenceService(db), new AiTokenQuotaService(
            db,
            Microsoft.Extensions.Options.Options.Create(new AiOptions { DailyTokenLimit = 50_000 })));

    private static WanderDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new WanderDbContext(options);
    }

    private static Trip SeedTrip(WanderDbContext db)
    {
        var trip = new Trip
        {
            OwnerId = OwnerId,
            Title = "Lisbon",
            Destination = "Lisbon, Portugal",
            StartDate = new DateOnly(2026, 6, 10),
            EndDate = new DateOnly(2026, 6, 11),
            Currency = "EUR",
            Days =
            [
                new Day
                {
                    OwnerId = OwnerId,
                    DayNumber = 1,
                    Date = new DateOnly(2026, 6, 10),
                },
            ],
        };
        db.Trips.Add(trip);
        db.SaveChanges();
        return trip;
    }

    private sealed class CapturingAiProvider : IAiProvider
    {
        public bool IsEnabled => true;
        public AiCompletionRequest? LastRequest { get; private set; }

        public async IAsyncEnumerable<AiCompletionDelta> CompleteAsync(
            AiCompletionRequest request,
            [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
        {
            LastRequest = request;
            await Task.CompletedTask;
            yield return new TextDelta(FakeAiProvider.SampleDraftJson);
            yield return new CompletionDone(new AiUsage(10, 20), AiFinishReason.Stop);
        }
    }
}

public class AiGenerateItineraryControllerTests
{
    private const string OwnerId = "owner-user";

    [Fact]
    public async Task GenerateItinerary_WhenDisabled_Returns503()
    {
        var ctrl = new AiController(new DisabledAiProvider(), NewQuotaService(), new NoopDraftService(), new NoopPlanningService(), new NoopUndoService())
        {
            ControllerContext = FakeAuth.ForUser(OwnerId),
        };

        var result = await ctrl.GenerateItinerary(
            Guid.NewGuid(),
            new GenerateItineraryRequest("Plan my trip"),
            CancellationToken.None);

        Assert.Equal(503, ((ObjectResult)result.Result!).StatusCode);
    }

    [Fact]
    public async Task GenerateItinerary_WhenEnabled_ReturnsDraft()
    {
        await using var db = NewDb();
        var trip = SeedTrip(db);
        var drafts = new AiItineraryDraftService(
            new FakeAiProvider(),
            new EfCoreTripRepository(db),
            new PreferenceService(db),
            NewQuotaService(db));

        var ctrl = new AiController(new FakeAiProvider(), NewQuotaService(db), drafts, new NoopPlanningService(), new NoopUndoService())
        {
            ControllerContext = FakeAuth.ForUser(OwnerId),
        };

        var ok = Assert.IsType<OkObjectResult>((
            await ctrl.GenerateItinerary(trip.Id, new GenerateItineraryRequest("Plan day 1"), CancellationToken.None)).Result);
        var body = Assert.IsType<GenerateItineraryResponse>(ok.Value);
        Assert.NotEmpty(body.Items);
    }

    private static IAiTokenQuotaService NewQuotaService(WanderDbContext? db = null)
    {
        db ??= NewDb();
        return new AiTokenQuotaService(
            db,
            Microsoft.Extensions.Options.Options.Create(new AiOptions { DailyTokenLimit = 50_000 }));
    }

    private static WanderDbContext NewDb() =>
        new(new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static Trip SeedTrip(WanderDbContext db)
    {
        var trip = new Trip
        {
            OwnerId = OwnerId,
            Title = "Lisbon",
            Destination = "Lisbon, Portugal",
            StartDate = new DateOnly(2026, 6, 10),
            EndDate = new DateOnly(2026, 6, 11),
            Currency = "EUR",
            Days = [new Day { OwnerId = OwnerId, DayNumber = 1, Date = new DateOnly(2026, 6, 10) }],
        };
        db.Trips.Add(trip);
        db.SaveChanges();
        return trip;
    }

    private sealed class NoopDraftService : IAiItineraryDraftService
    {
        public Task<GenerateItineraryResponse> GenerateAsync(
            string ownerId,
            Guid tripId,
            GenerateItineraryRequest request,
            CancellationToken ct = default) =>
            throw new NotImplementedException();
    }

    private sealed class NoopPlanningService : IAiPlanningService
    {
        public IAsyncEnumerable<AiChatStreamEvent> StreamChatAsync(
            string ownerId,
            Guid tripId,
            AiChatRequest request,
            CancellationToken ct = default) =>
            throw new NotImplementedException();
    }

    private sealed class NoopUndoService : IAiUndoService
    {
        public IReadOnlyList<AiTripChange> ApplyUndo(string ownerId, Guid tripId, IReadOnlyList<AiUndoStep> steps) =>
            throw new NotImplementedException();
    }
}
