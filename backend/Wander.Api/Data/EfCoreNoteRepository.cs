using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

public class EfCoreNoteRepository : INoteRepository
{
    private readonly WanderDbContext _ctx;

    public EfCoreNoteRepository(WanderDbContext ctx) => _ctx = ctx;

    private bool OwnsTrip(Guid tripId, string ownerId) =>
        _ctx.Trips.Any(t => t.Id == tripId && t.OwnerId == ownerId);

    public IEnumerable<Note> GetForTrip(Guid tripId, string ownerId)
    {
        if (!OwnsTrip(tripId, ownerId))
            return [];

        return _ctx.Notes
            .Include(n => n.MediaAssets)
            .Where(n => n.TripId == tripId && n.OwnerId == ownerId && n.DeletedAt == null)
            .OrderByDescending(n => n.CreatedAt)
            .ToList();
    }

    public IEnumerable<Note> GetAllForTrip(Guid tripId) =>
        _ctx.Notes
            .Include(n => n.MediaAssets)
            .Where(n => n.TripId == tripId && n.DeletedAt == null)
            .OrderByDescending(n => n.CreatedAt)
            .ToList();

    public Note? Add(Guid tripId, string ownerId, Note note)
    {
        if (!OwnsTrip(tripId, ownerId))
            return null;

        return Persist(tripId, ownerId, note);
    }

    public Note AddAuthored(Guid tripId, string authorOwnerId, Note note) =>
        Persist(tripId, authorOwnerId, note);

    private Note Persist(Guid tripId, string ownerId, Note note)
    {
        var now = DateTimeOffset.UtcNow;
        note.TripId = tripId;
        note.OwnerId = ownerId;
        note.CreatedAt = now;
        note.UpdatedAt = now;
        foreach (var media in note.MediaAssets)
        {
            media.OwnerId = ownerId;
            media.CreatedAt = now;
            media.UpdatedAt = now;
        }

        _ctx.Notes.Add(note);
        _ctx.SaveChanges();
        return note;
    }

    public Guid? GetTripIdForMediaAsset(Guid mediaAssetId) =>
        _ctx.MediaAssets
            .Where(m => m.Id == mediaAssetId)
            .Join(_ctx.Notes, m => m.NoteId, n => n.Id, (m, n) => (Guid?)n.TripId)
            .FirstOrDefault();

    public Guid? GetTripIdForNote(Guid noteId, string ownerId) =>
        _ctx.Notes
            .Where(n => n.Id == noteId && n.OwnerId == ownerId && n.DeletedAt == null)
            .Select(n => (Guid?)n.TripId)
            .FirstOrDefault();

    public Note? UpdateBody(Guid noteId, string ownerId, string? bodyText)
    {
        var note = _ctx.Notes
            .Include(n => n.MediaAssets)
            .FirstOrDefault(n => n.Id == noteId && n.OwnerId == ownerId && n.DeletedAt == null);
        if (note is null)
            return null;

        note.BodyText = bodyText;
        note.UpdatedAt = DateTimeOffset.UtcNow;
        _ctx.SaveChanges();
        return note;
    }

    public bool Delete(Guid noteId, string ownerId)
    {
        var note = _ctx.Notes.FirstOrDefault(n => n.Id == noteId && n.OwnerId == ownerId && n.DeletedAt == null);
        if (note is null)
            return false;

        note.DeletedAt = DateTimeOffset.UtcNow;
        _ctx.SaveChanges();
        return true;
    }

    public MediaAsset? GetMediaAsset(Guid mediaAssetId) =>
        _ctx.MediaAssets.FirstOrDefault(m => m.Id == mediaAssetId);

    public bool SetTranscript(Guid mediaAssetId, string transcript, TranscriptionStatus status)
    {
        var asset = _ctx.MediaAssets.FirstOrDefault(m => m.Id == mediaAssetId);
        if (asset is null)
            return false;

        asset.Transcript = transcript;
        asset.TranscriptionStatus = status;
        asset.UpdatedAt = DateTimeOffset.UtcNow;
        _ctx.SaveChanges();
        return true;
    }
}
