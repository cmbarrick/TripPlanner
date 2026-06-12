using System.Net;
using System.Text;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Wander.Api.Data;
using Wander.Api.Media;
using Wander.Api.Models;

namespace Wander.Api.Recaps;

public interface IRecapExportService
{
    /// <summary>Renders the recap as a polished PDF; optionally embeds photos from the notes
    /// that grounded the recap.</summary>
    Task<byte[]> RenderPdfAsync(Recap recap, Trip trip, bool includePhotos, CancellationToken ct);

    /// <summary>Renders the standalone, unlisted share page (no app shell, no auth assets).</summary>
    string RenderHtml(Recap recap, Trip trip);
}

public sealed class RecapExportService(INoteRepository notes, IBlobStore blobs) : IRecapExportService
{
    /// <summary>Cap embedded photos so a photo-heavy trip can't produce a runaway PDF.</summary>
    public const int MaxPhotos = 12;

    static RecapExportService() => QuestPDF.Settings.License = LicenseType.Community;

    public async Task<byte[]> RenderPdfAsync(Recap recap, Trip trip, bool includePhotos, CancellationToken ct)
    {
        var blocks = RecapMarkdown.Parse(recap.Body);
        var photos = includePhotos ? await LoadPhotosAsync(recap, ct) : [];

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(46);
                page.DefaultTextStyle(t => t.FontSize(11).FontColor("#0f172a"));

                page.Header().Column(col =>
                {
                    col.Item().Text(recap.Title).FontSize(22).Bold().FontColor("#0d9488");
                    col.Item().PaddingTop(2).Text(
                            $"{trip.Title} — {trip.Destination} · {trip.StartDate:MMM d} – {trip.EndDate:MMM d, yyyy}")
                        .FontSize(10).FontColor("#64748b");
                    col.Item().PaddingTop(8).LineHorizontal(1).LineColor("#e2e8f0");
                });

                page.Content().PaddingVertical(12).Column(col =>
                {
                    foreach (var block in blocks)
                    {
                        switch (block)
                        {
                            case RecapMarkdown.Heading h:
                                col.Item().PaddingTop(10).Text(h.Text).FontSize(15).SemiBold().FontColor("#134e4a");
                                break;
                            case RecapMarkdown.Bullet b:
                                col.Item().PaddingTop(3).Row(row =>
                                {
                                    row.ConstantItem(14).Text("•").FontColor("#0d9488");
                                    row.RelativeItem().Text(b.Text);
                                });
                                break;
                            case RecapMarkdown.Paragraph p:
                                col.Item().PaddingTop(6).Text(p.Text).LineHeight(1.4f);
                                break;
                        }
                    }

                    foreach (var photo in photos)
                    {
                        col.Item().PaddingTop(14).Image(photo).FitWidth();
                    }
                });

                page.Footer().Row(row =>
                {
                    row.RelativeItem().Text("Made with Wander").FontSize(9).FontColor("#94a3b8");
                    row.RelativeItem().AlignRight().Text(t =>
                    {
                        t.DefaultTextStyle(s => s.FontSize(9).FontColor("#94a3b8"));
                        t.CurrentPageNumber();
                        t.Span(" / ");
                        t.TotalPages();
                    });
                });
            });
        }).GeneratePdf();
    }

    public string RenderHtml(Recap recap, Trip trip)
    {
        var sb = new StringBuilder();
        var title = WebUtility.HtmlEncode(recap.Title);
        var subtitle = WebUtility.HtmlEncode(
            $"{trip.Title} — {trip.Destination} · {trip.StartDate:MMM d} – {trip.EndDate:MMM d, yyyy}");

        sb.Append($$"""
            <!doctype html>
            <html lang="en">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="robots" content="noindex, nofollow">
            <title>{{title}}</title>
            <style>
              body { margin:0; background:#f1f5f9; font-family:-apple-system,'Segoe UI',Roboto,sans-serif; color:#0f172a; }
              .page { max-width:680px; margin:0 auto; padding:32px 20px 60px; }
              .card { background:#fff; border:1px solid #e2e8f0; border-radius:18px; padding:32px; }
              h1 { color:#0d9488; font-size:26px; margin:0 0 4px; }
              .sub { color:#64748b; font-size:13px; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:16px; }
              h2 { color:#134e4a; font-size:18px; margin:22px 0 6px; }
              p { line-height:1.55; font-size:15px; margin:10px 0; }
              ul { padding-left:22px; } li { line-height:1.5; font-size:15px; margin:4px 0; }
              .foot { text-align:center; color:#94a3b8; font-size:12px; margin-top:24px; }
            </style>
            </head>
            <body><div class="page"><div class="card">
            """);
        sb.Append($"<h1>{title}</h1><div class=\"sub\">{subtitle}</div>");

        var inList = false;
        foreach (var block in RecapMarkdown.Parse(recap.Body))
        {
            if (block is RecapMarkdown.Bullet bullet)
            {
                if (!inList) { sb.Append("<ul>"); inList = true; }
                sb.Append($"<li>{WebUtility.HtmlEncode(bullet.Text)}</li>");
                continue;
            }

            if (inList) { sb.Append("</ul>"); inList = false; }
            switch (block)
            {
                case RecapMarkdown.Heading h:
                    sb.Append($"<h2>{WebUtility.HtmlEncode(h.Text)}</h2>");
                    break;
                case RecapMarkdown.Paragraph p:
                    sb.Append($"<p>{WebUtility.HtmlEncode(p.Text)}</p>");
                    break;
            }
        }
        if (inList) sb.Append("</ul>");

        sb.Append("""
            </div><div class="foot">Shared privately with Wander · unlisted link</div></div></body></html>
            """);
        return sb.ToString();
    }

    /// <summary>Photo bytes from the notes that grounded this recap (oldest first, capped).</summary>
    private async Task<List<byte[]>> LoadPhotosAsync(Recap recap, CancellationToken ct)
    {
        var sourceIds = recap.GeneratedFromNoteIds.ToHashSet();
        var photoAssets = notes.GetForTrip(recap.TripId, recap.OwnerId)
            .Where(n => sourceIds.Contains(n.Id))
            .OrderBy(n => n.CreatedAt)
            .SelectMany(n => n.MediaAssets)
            .Where(m => m.Kind == MediaAssetKind.Photo)
            .Take(MaxPhotos);

        var photos = new List<byte[]>();
        foreach (var asset in photoAssets)
        {
            try
            {
                await using var stream = await blobs.OpenReadAsync(asset.BlobName, ct);
                using var ms = new MemoryStream();
                await stream.CopyToAsync(ms, ct);
                photos.Add(ms.ToArray());
            }
            catch (Exception ex) when (ex is IOException or FileNotFoundException or InvalidOperationException)
            {
                // A missing blob shouldn't sink the whole export — skip the photo.
            }
        }

        return photos;
    }
}
