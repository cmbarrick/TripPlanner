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
    public void GetForTrip_AsNonMember_ReturnsNotFound()
    {
        // A user with no access to the trip can't see its (now shared) notes — NotFound, not an
        // empty list, so trip existence isn't leaked.
        var (ctrl, _, trip) = Build();
        ctrl.Create(trip.Id, new CreateNoteRequest(NoteScope.Trip, null, NoteKind.Text, "secret", null));

        ctrl.ControllerContext = FakeAuth.ForUser(OtherUserId);
        Assert.IsType<NotFoundResult>(ctrl.GetForTrip(trip.Id).Result);
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

    [Fact]
    public void Update_OwnNote_ChangesBodyText()
    {
        var (ctrl, ctx, trip) = Build();
        var created = (Note)((OkObjectResult)ctrl.Create(
            trip.Id, new CreateNoteRequest(NoteScope.Trip, null, NoteKind.Text, "before", null)).Result!).Value!;

        var ok = Assert.IsType<OkObjectResult>(ctrl.Update(created.Id, new UpdateNoteRequest("after")).Result);
        var updated = Assert.IsType<Note>(ok.Value);
        Assert.Equal("after", updated.BodyText);
        Assert.Equal("after", ctx.Notes.Single().BodyText);
    }

    [Fact]
    public void Update_OtherUsersNote_ReturnsNotFound()
    {
        var (ctrl, _, trip) = Build();
        var created = (Note)((OkObjectResult)ctrl.Create(
            trip.Id, new CreateNoteRequest(NoteScope.Trip, null, NoteKind.Text, "before", null)).Result!).Value!;

        ctrl.ControllerContext = FakeAuth.ForUser(OtherUserId);
        Assert.IsType<NotFoundResult>(ctrl.Update(created.Id, new UpdateNoteRequest("hacked")).Result);
    }

    [Fact]
    public void Update_StaleVersion_ReturnsConflict()
    {
        var (ctrl, ctx, trip) = Build();
        var created = (Note)((OkObjectResult)ctrl.Create(
            trip.Id, new CreateNoteRequest(NoteScope.Trip, null, NoteKind.Text, "before", null)).Result!).Value!;
        // Copy the value out before mutating — `ctx.Notes.Single(...)` below returns the very same
        // tracked instance as `created` (EF Core's identity map), so bumping it in place would
        // otherwise silently update `created.Version` too and defeat the "stale" setup.
        var originalVersion = created.Version;

        // Someone else's edit lands first and bumps the row's version (see the matching comment in
        // EfCoreTripRepositoryTests — the in-memory provider doesn't auto-bump xmin like Postgres
        // does, so the test bumps it explicitly to exercise the same conflict-detection path).
        var tracked = ctx.Notes.Single(n => n.Id == created.Id);
        ctx.Entry(tracked).Property("Version").CurrentValue = originalVersion + 1;
        ctx.SaveChanges();

        var result = ctrl.Update(created.Id, new UpdateNoteRequest("stale edit", originalVersion));

        var conflict = Assert.IsType<ConflictObjectResult>(result.Result);
        Assert.Equal(409, conflict.StatusCode);
        // The failed SaveChanges leaves the tracked entity's in-memory BodyText mutated even though
        // nothing was actually persisted (EF Core doesn't roll back C# property values on a thrown
        // DbUpdateConcurrencyException) — clear the tracker so this re-query reflects the real,
        // unpersisted-change store instead of that dirty local state.
        ctx.ChangeTracker.Clear();
        Assert.Equal("before", ctx.Notes.Single().BodyText);
    }

    [Fact]
    public void Update_BodyTooLong_ReturnsBadRequest()
    {
        var (ctrl, _, trip) = Build();
        var created = (Note)((OkObjectResult)ctrl.Create(
            trip.Id, new CreateNoteRequest(NoteScope.Trip, null, NoteKind.Text, "before", null)).Result!).Value!;

        var tooLong = new string('x', Note.MaxBodyLength + 1);
        Assert.IsType<BadRequestObjectResult>(ctrl.Update(created.Id, new UpdateNoteRequest(tooLong)).Result);
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

    [Fact]
    public async Task GetMedia_OwnVoiceNoteAudio_ReturnsFileStream()
    {
        var (ctrl, _, trip) = Build();
        var voice = await ctrl.CreateVoiceNote(
            trip.Id, new CreateVoiceNoteRequest { Scope = NoteScope.Trip, Audio = FakeAudioFile() }, CancellationToken.None);
        var note = (Note)((OkObjectResult)voice.Result!).Value!;

        var result = await ctrl.GetMedia(trip.Id, note.MediaAssets[0].Id, CancellationToken.None);
        var file = Assert.IsType<FileStreamResult>(result);
        Assert.Equal("audio/m4a", file.ContentType);
    }

    [Fact]
    public async Task GetMedia_OtherUser_ReturnsNotFound()
    {
        var (ctrl, _, trip) = Build();
        var voice = await ctrl.CreateVoiceNote(
            trip.Id, new CreateVoiceNoteRequest { Scope = NoteScope.Trip, Audio = FakeAudioFile() }, CancellationToken.None);
        var note = (Note)((OkObjectResult)voice.Result!).Value!;

        ctrl.ControllerContext = FakeAuth.ForUser(OtherUserId);
        var result = await ctrl.GetMedia(trip.Id, note.MediaAssets[0].Id, CancellationToken.None);
        Assert.IsType<NotFoundResult>(result);
    }

    // ── Media SAS (direct download) ───────────────────────────────────────────

    [Fact]
    public async Task GetMediaSas_WhenStoreCanSign_ReturnsSignedUrl()
    {
        var (ctrl, _, trip) = BuildWithBlobs(out var blobs);
        blobs.SasBaseUrl = "https://store.example/container";
        var voice = await ctrl.CreateVoiceNote(
            trip.Id, new CreateVoiceNoteRequest { Scope = NoteScope.Trip, Audio = FakeAudioFile() }, CancellationToken.None);
        var note = (Note)((OkObjectResult)voice.Result!).Value!;

        var result = await ctrl.GetMediaSas(trip.Id, note.MediaAssets[0].Id, CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result);
        var body = Assert.IsType<MediaSasResponse>(ok.Value);
        Assert.Contains("sig=fake", body.Url);
        Assert.True(body.ExpiresAt > DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task GetMediaSas_WhenStoreCannotSign_ReturnsNoContent()
    {
        var (ctrl, _, trip) = BuildWithBlobs(out _); // SasBaseUrl null → no SAS
        var voice = await ctrl.CreateVoiceNote(
            trip.Id, new CreateVoiceNoteRequest { Scope = NoteScope.Trip, Audio = FakeAudioFile() }, CancellationToken.None);
        var note = (Note)((OkObjectResult)voice.Result!).Value!;

        var result = await ctrl.GetMediaSas(trip.Id, note.MediaAssets[0].Id, CancellationToken.None);
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task GetMediaSas_OtherUser_ReturnsNotFound()
    {
        var (ctrl, _, trip) = BuildWithBlobs(out var blobs);
        blobs.SasBaseUrl = "https://store.example/container";
        var voice = await ctrl.CreateVoiceNote(
            trip.Id, new CreateVoiceNoteRequest { Scope = NoteScope.Trip, Audio = FakeAudioFile() }, CancellationToken.None);
        var note = (Note)((OkObjectResult)voice.Result!).Value!;

        ctrl.ControllerContext = FakeAuth.ForUser(OtherUserId);
        var result = await ctrl.GetMediaSas(trip.Id, note.MediaAssets[0].Id, CancellationToken.None);
        Assert.IsType<NotFoundResult>(result);
    }

    // ── Photo notes ───────────────────────────────────────────────────────────

    [Fact]
    public async Task CreatePhotoNote_StoresPhotoMediaWithoutTranscription()
    {
        var (ctrl, _, trip) = Build(out var queue);
        var request = new CreatePhotoNoteRequest
        {
            Scope = NoteScope.Event,
            TargetId = Guid.NewGuid(),
            BodyText = "Sunset over the Tiber",
            Image = FakeImageFile(),
        };

        var result = await ctrl.CreatePhotoNote(trip.Id, request, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var note = Assert.IsType<Note>(ok.Value);
        var media = Assert.Single(note.MediaAssets);
        Assert.Equal(MediaAssetKind.Photo, media.Kind);
        Assert.Equal(TranscriptionStatus.None, media.TranscriptionStatus);
        Assert.Empty(queue.Jobs);
    }

    [Fact]
    public async Task CreatePhotoNote_WithoutImage_ReturnsBadRequest()
    {
        var (ctrl, _, trip) = Build();
        var result = await ctrl.CreatePhotoNote(
            trip.Id, new CreatePhotoNoteRequest { Scope = NoteScope.Trip }, CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task GetMedia_OwnPhoto_ReturnsFileStream()
    {
        var (ctrl, _, trip) = Build();
        var photo = await ctrl.CreatePhotoNote(
            trip.Id, new CreatePhotoNoteRequest { Scope = NoteScope.Trip, Image = FakeImageFile() }, CancellationToken.None);
        var note = (Note)((OkObjectResult)photo.Result!).Value!;

        var result = await ctrl.GetMedia(trip.Id, note.MediaAssets[0].Id, CancellationToken.None);
        var file = Assert.IsType<FileStreamResult>(result);
        Assert.Equal("image/jpeg", file.ContentType);
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

    private static (NotesController ctrl, WanderDbContext ctx, Trip trip) BuildWithBlobs(out FakeBlobStore blobs)
    {
        var ctx = NewContext();
        var trip = SeedTrip(ctx);
        blobs = new FakeBlobStore();
        var ctrl = new NotesController(
            new EfCoreNoteRepository(ctx),
            blobs,
            new FakeTranscriptionQueue(),
            new TripAccessService(ctx, new UserService(ctx)),
            new NoopRealtimeNotifier())
        {
            ControllerContext = FakeAuth.ForUser(OwnerId),
        };
        return (ctrl, ctx, trip);
    }

    private static (NotesController ctrl, WanderDbContext ctx, Trip trip) Build(out FakeTranscriptionQueue queue)
    {
        var ctx = NewContext();
        var trip = SeedTrip(ctx);
        queue = new FakeTranscriptionQueue();
        var ctrl = new NotesController(
            new EfCoreNoteRepository(ctx),
            new FakeBlobStore(),
            queue,
            new TripAccessService(ctx, new UserService(ctx)),
            new NoopRealtimeNotifier())
        {
            ControllerContext = FakeAuth.ForUser(OwnerId),
        };
        return (ctrl, ctx, trip);
    }

    /// <summary>No-op realtime notifier — these tests assert HTTP results, not broadcasts.</summary>
    private sealed class NoopRealtimeNotifier : Wander.Api.Realtime.ITripRealtimeNotifier
    {
        public void NotifyTripChanged(Guid tripId, string changeKind, string? actorUserId = null) { }
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

    private static FormFile FakeImageFile()
    {
        var bytes = new byte[] { 9, 8, 7, 6, 5 };
        return new FormFile(new MemoryStream(bytes), 0, bytes.Length, "Image", "photo.jpg")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/jpeg",
        };
    }

    private sealed class FakeBlobStore : IBlobStore
    {
        public Dictionary<string, byte[]> Blobs { get; } = [];

        /// <summary>When set, <see cref="TryGetReadSasUriAsync"/> returns a SAS-style URL built from
        /// this base; when null it returns null (the streaming-fallback path).</summary>
        public string? SasBaseUrl { get; set; }

        public async Task<BlobResult> SaveAsync(string blobName, Stream content, string contentType, CancellationToken ct)
        {
            using var ms = new MemoryStream();
            await content.CopyToAsync(ms, ct);
            Blobs[blobName] = ms.ToArray();
            return new BlobResult(blobName, $"https://fake.blob/{blobName}");
        }

        public Task<Stream> OpenReadAsync(string blobName, CancellationToken ct)
        {
            if (!Blobs.TryGetValue(blobName, out var bytes))
                throw new FileNotFoundException("Media blob not found.", blobName);
            return Task.FromResult<Stream>(new MemoryStream(bytes));
        }

        public Task<Uri?> TryGetReadSasUriAsync(string blobName, TimeSpan validFor, CancellationToken ct) =>
            Task.FromResult(SasBaseUrl is null ? null : new Uri($"{SasBaseUrl}/{blobName}?sig=fake"));
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
