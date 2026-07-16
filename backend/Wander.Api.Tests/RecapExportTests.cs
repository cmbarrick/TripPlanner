using Wander.Api.Data;
using Wander.Api.Media;
using Wander.Api.Models;
using Wander.Api.Recaps;

namespace Wander.Api.Tests;

public class RecapMarkdownTests
{
    [Fact]
    public void Parse_SplitsHeadingsBulletsAndParagraphs()
    {
        var body = """
            ## Day 1

            We swam in the
            warm sea.

            - granita
            - arancini

            Then home.
            """;

        var blocks = RecapMarkdown.Parse(body);

        Assert.Collection(blocks,
            b => Assert.Equal("Day 1", Assert.IsType<RecapMarkdown.Heading>(b).Text),
            b => Assert.Equal("We swam in the warm sea.", Assert.IsType<RecapMarkdown.Paragraph>(b).Text),
            b => Assert.Equal("granita", Assert.IsType<RecapMarkdown.Bullet>(b).Text),
            b => Assert.Equal("arancini", Assert.IsType<RecapMarkdown.Bullet>(b).Text),
            b => Assert.Equal("Then home.", Assert.IsType<RecapMarkdown.Paragraph>(b).Text));
    }
}

public class RecapExportServiceTests
{
    [Fact]
    public async Task RenderPdf_ProducesValidPdfBytes()
    {
        var svc = new RecapExportService(new EmptyNotes(), new ThrowingBlobs());
        var (recap, trip) = Sample();

        var pdf = await svc.RenderPdfAsync(recap, trip, includePhotos: false, CancellationToken.None);

        Assert.True(pdf.Length > 500);
        Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(pdf[..4]));
    }

    [Fact]
    public void RenderHtml_EscapesUserContent_AndIsNoindex()
    {
        var svc = new RecapExportService(new EmptyNotes(), new ThrowingBlobs());
        var (recap, trip) = Sample();
        recap.Body = "## Day <1>\n\nA day with <script>alert('x')</script> fun.";

        var html = svc.RenderHtml(recap, trip);

        Assert.Contains("noindex", html);
        Assert.Contains("Day &lt;1&gt;", html);
        Assert.DoesNotContain("<script>alert", html);
        Assert.Contains("A sicilian week", html);
    }

    private static (Recap Recap, Trip Trip) Sample()
    {
        var trip = new Trip
        {
            Title = "Sicily",
            Destination = "Sicily, Italy",
            StartDate = new DateOnly(2026, 5, 1),
            EndDate = new DateOnly(2026, 5, 8),
        };
        var recap = new Recap
        {
            TripId = trip.Id,
            OwnerId = "owner-user",
            Title = "A sicilian week",
            Body = "## Day 1\n\nWe swam.\n\n- granita",
        };
        return (recap, trip);
    }

    private sealed class EmptyNotes : INoteRepository
    {
        public IEnumerable<Note> GetForTrip(Guid tripId, string ownerId) => [];
        public IEnumerable<Note> GetAllForTrip(Guid tripId) => [];
        public Note? Add(Guid tripId, string ownerId, Note note) => null;
        public Note AddAuthored(Guid tripId, string authorOwnerId, Note note) => note;
        public Note? UpdateBody(Guid noteId, string ownerId, string? bodyText) => null;
        public bool Delete(Guid noteId, string ownerId) => false;
        public MediaAsset? GetMediaAsset(Guid mediaAssetId) => null;
        public Guid? GetTripIdForMediaAsset(Guid mediaAssetId) => null;
        public Guid? GetTripIdForNote(Guid noteId, string ownerId) => null;
        public bool SetTranscript(Guid mediaAssetId, string transcript, TranscriptionStatus status) => false;
    }

    private sealed class ThrowingBlobs : IBlobStore
    {
        public Task<BlobResult> SaveAsync(string blobName, Stream content, string contentType, CancellationToken ct)
            => throw new InvalidOperationException();
        public Task<Stream> OpenReadAsync(string blobName, CancellationToken ct)
            => throw new InvalidOperationException();
        public Task<Uri?> TryGetReadSasUriAsync(string blobName, TimeSpan validFor, CancellationToken ct)
            => Task.FromResult<Uri?>(null);
    }
}
