using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Wander.Api.Controllers;
using Wander.Api.Data;
using Wander.Api.Media;
using Wander.Api.Models;
using Wander.Api.Transcription;

namespace Wander.Api.Tests;

public class NotesControllerTests
{
    private const string OwnerId = "owner-user";
    private const string OtherUserId = "other-user";

    // ── Text notes ────────────────────────────────────────────────────────────

    [Fact]
    public void Create_TripScopedTextNote_PersistsAndReturnsOk()
    {
        var (ctrl, ctx, trip) = Build();
        var result = ctrl.Create(trip.Id, new CreateNoteRequest(NoteScope.Trip, null, NoteKind.Text, "Loved the food", null));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var note = Assert.IsType<Note>(ok.Value);
        Assert.Equal(OwnerId, note.OwnerId);
        Assert.Equal(trip.Id, note.TripId);
        Assert.Single(ctx.Notes);
    }

    [Fact]
    public void Create_EventScopeWithoutTarget_ReturnsBadRequest()
    {
        var (ctrl, _, trip) = Build();
        var result = ctrl.Create(trip.Id, new CreateNoteRequest(NoteScope.Event, null, NoteKind.Text, "x", null));
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public void Create_OnTripNotOwned_ReturnsNotFound()
    {
        var (ctrl, _, _) = Build();
        var result = ctrl.Create(Guid.NewGuid(), new CreateNoteRequest(NoteScope.Trip, null, NoteKind.Text, "x", null));
        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public void GetForTrip_ReturnsOwnNotesNewestFirst()
    {
        var (ctrl, ctx, trip) = Build();
        ctrl.Create(trip.Id, new CreateNoteRequest(NoteScope.Trip, null, NoteKind.Text, "first", null));
        ctrl.Create(trip.Id, new CreateNoteRequest(NoteScope.Trip, null, NoteKind.Text, "second", null));

        var ok = Assert.IsType<OkObjectResult>(ctrl.GetForTrip(trip.Id).Result);
        var notes = Assert.IsAssignableFrom<IEnumerable<Note>>(ok.Value);
        Assert.Equal(2, notes.Count());
    }

    [Fact]
    public void GetForTrip_AsOtherUser_ReturnsEmpty()
    {
        var (ctrl, _, trip) = Build();
        ctrl.Create(trip.Id, new CreateNoteRequest(NoteScope.Trip, null, NoteKind.Text, "secret", null));

        ctrl.ControllerContext = FakeAuth.ForUser(OtherUserId);
        var ok = Assert.IsType<OkObjectResult>(ctrl.GetForTrip(trip.Id).Result);
        var notes = Assert.IsAssignableFrom<IEnumerable<Note>>(ok.Value);
        Assert.Empty(notes);
    }

    [Fact]
    public void Delete_OwnNote_SoftDeletes()
    {
        var (ctrl, ctx, trip) = Build();
        var created = (Note)((OkObjectResult)ctrl.Create(
            trip.Id, new CreateNoteRequest(NoteScope.Trip, null, NoteKind.Text, "bye", null)).Result!).Value!;

        Assert.IsType<NoContentResult>(ctrl.Delete(created.Id));
        Assert.NotNull(ctx.Notes.Single().DeletedAt);
    }

    [Fact]
    public void Delete_OtherUsersNote_ReturnsNotFound()
    {
        var (ctrl, _, trip) = Build();
        var created = (Note)((OkObjectResult)ctrl.Create(
            trip.Id, new CreateNoteRequest(NoteScope.Trip, null, NoteKind.Text, "bye", null)).Result!).Value!;

        ctrl.ControllerContext = FakeAuth.ForUser(OtherUserId);
        Assert.IsType<NotFoundResult>(ctrl.Delete(created.Id));
    }

    // ── Voice notes ───────────────────────────────────────────────────────────

    [Fact]
    public async Task CreateVoiceNote_StoresPendingMediaAndEnqueuesJob()
    {
        var (ctrl, ctx, trip) = Build(out var queue);
        var request = new CreateVoiceNoteRequest
        {
            Scope = NoteScope.Event,
            TargetId = Guid.NewGuid(),
            DurationSeconds = 12,
            Audio = FakeAudioFile(),
        };

        var result = await ctrl.CreateVoiceNote(trip.Id, request, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var note = Assert.IsType<Note>(ok.Value);
        Assert.Equal(NoteKind.Voice, note.Kind);
        var media = Assert.Single(note.MediaAssets);
        Assert.Equal(MediaAssetKind.Audio, media.Kind);
        Assert.Equal(TranscriptionStatus.Pending, media.TranscriptionStatus);

        var job = Assert.Single(queue.Jobs);
        Assert.Equal(media.Id, job.MediaAssetId);
        Assert.Equal(media.BlobName, job.BlobName);
    }

    [Fact]
    public async Task CreateVoiceNote_WithoutAudio_ReturnsBadRequest()
    {
        var (ctrl, _, trip) = Build();
        var result = await ctrl.CreateVoiceNote(trip.Id, new CreateVoiceNoteRequest(), CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    // ── Transcript callback (service-to-service) ──────────────────────────────

    [Fact]
    public void SetTranscript_WithValidKey_StoresTranscript()
    {
        var (_, ctx, trip) = Build();
        var asset = SeedAudioAsset(ctx, trip);
        var ctrl = CallbackController(ctx, "secret-key", providedKey: "secret-key");

        var result = ctrl.SetTranscript(asset.Id, new TranscriptCallbackRequest("hello world", true));

        Assert.IsType<NoContentResult>(result);
        var updated = ctx.MediaAssets.Single();
        Assert.Equal("hello world", updated.Transcript);
        Assert.Equal(TranscriptionStatus.Completed, updated.TranscriptionStatus);
    }

    [Fact]
    public void SetTranscript_WithWrongKey_ReturnsUnauthorized()
    {
        var (_, ctx, trip) = Build();
        var asset = SeedAudioAsset(ctx, trip);
        var ctrl = CallbackController(ctx, "secret-key", providedKey: "nope");

        var result = ctrl.SetTranscript(asset.Id, new TranscriptCallbackRequest("x", true));
        Assert.IsType<UnauthorizedResult>(result);
    }

    [Fact]
    public void SetTranscript_UnknownAsset_ReturnsNotFound()
    {
        var (_, ctx, _) = Build();
        var ctrl = CallbackController(ctx, "secret-key", providedKey: "secret-key");

        var result = ctrl.SetTranscript(Guid.NewGuid(), new TranscriptCallbackRequest("x", true));
        Assert.IsType<NotFoundResult>(result);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static (NotesController ctrl, WanderDbContext ctx, Trip trip) Build() =>
        Build(out _);

    private static (NotesController ctrl, WanderDbContext ctx, Trip trip) Build(out FakeTranscriptionQueue queue)
    {
        var ctx = NewContext();
        var trip = SeedTrip(ctx);
        queue = new FakeTranscriptionQueue();
        var ctrl = new NotesController(new EfCoreNoteRepository(ctx), new FakeBlobStore(), queue)
        {
            ControllerContext = FakeAuth.ForUser(OwnerId),
        };
        return (ctrl, ctx, trip);
    }

    private static InternalTranscriptionController CallbackController(WanderDbContext ctx, string configuredKey, string providedKey)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Functions:CallbackKey"] = configuredKey })
            .Build();
        var http = new DefaultHttpContext();
        http.Request.Headers[InternalTranscriptionController.CallbackHeader] = providedKey;
        return new InternalTranscriptionController(new EfCoreNoteRepository(ctx), config)
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };
    }

    private static WanderDbContext NewContext() =>
        new(new DbContextOptionsBuilder<WanderDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static Trip SeedTrip(WanderDbContext ctx)
    {
        var trip = new Trip
        {
            Id = Guid.NewGuid(), OwnerId = OwnerId, Title = "Rome", Destination = "Rome, Italy",
            Currency = "EUR", StartDate = new DateOnly(2026, 7, 1), EndDate = new DateOnly(2026, 7, 3),
            Travelers = 2, CoverTheme = "rome",
        };
        ctx.Trips.Add(trip);
        ctx.SaveChanges();
        return trip;
    }

    private static MediaAsset SeedAudioAsset(WanderDbContext ctx, Trip trip)
    {
        var note = new Note
        {
            Id = Guid.NewGuid(), TripId = trip.Id, OwnerId = OwnerId, Kind = NoteKind.Voice,
            MediaAssets =
            [
                new MediaAsset
                {
                    Id = Guid.NewGuid(), OwnerId = OwnerId, Kind = MediaAssetKind.Audio,
                    BlobName = "owner/trip/asset.m4a", TranscriptionStatus = TranscriptionStatus.Pending,
                },
            ],
        };
        ctx.Notes.Add(note);
        ctx.SaveChanges();
        return note.MediaAssets[0];
    }

    private static FormFile FakeAudioFile()
    {
        var bytes = new byte[] { 1, 2, 3, 4 };
        return new FormFile(new MemoryStream(bytes), 0, bytes.Length, "Audio", "memo.m4a")
        {
            Headers = new HeaderDictionary(),
            ContentType = "audio/m4a",
        };
    }

    private sealed class FakeBlobStore : IBlobStore
    {
        public Task<BlobResult> SaveAsync(string blobName, Stream content, string contentType, CancellationToken ct) =>
            Task.FromResult(new BlobResult(blobName, $"https://fake.blob/{blobName}"));
    }

    private sealed class FakeTranscriptionQueue : ITranscriptionQueue
    {
        public List<TranscriptionJob> Jobs { get; } = [];

        public Task EnqueueAsync(TranscriptionJob job, CancellationToken ct)
        {
            Jobs.Add(job);
            return Task.CompletedTask;
        }
    }
}
