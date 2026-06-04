using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>Persistence for journal notes and their media. All trip-scoped operations enforce that
/// the trip belongs to the caller; the transcript write-back is keyed by media-asset id (it is
/// authorized by the service-to-service callback key, not a user identity).</summary>
public interface INoteRepository
{
    /// <summary>Notes for a trip (newest first), including media. Empty if the trip isn't the owner's.</summary>
    IEnumerable<Note> GetForTrip(Guid tripId, string ownerId);

    /// <summary>Adds a note (and any attached media) to a trip the owner controls; null if not owned.</summary>
    Note? Add(Guid tripId, string ownerId, Note note);

    /// <summary>Soft-deletes a note the owner controls.</summary>
    bool Delete(Guid noteId, string ownerId);

    /// <summary>Looks up a media asset by id (no ownership filter — used by trusted callbacks).</summary>
    MediaAsset? GetMediaAsset(Guid mediaAssetId);

    /// <summary>Stores a transcript against an audio asset (service-to-service callback).</summary>
    bool SetTranscript(Guid mediaAssetId, string transcript, TranscriptionStatus status);
}
