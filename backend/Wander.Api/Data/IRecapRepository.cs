using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>Persistence for AI recaps. All owner-keyed operations enforce that the trip/recap
/// belongs to the caller (same pattern as <see cref="INoteRepository"/>); the share-token lookup
/// is the one anonymous path — the unguessable token is the capability.</summary>
public interface IRecapRepository
{
    /// <summary>Recaps for a trip (newest first). Empty if the trip isn't the owner's.</summary>
    IEnumerable<Recap> GetForTrip(Guid tripId, string ownerId);

    /// <summary>A single recap the owner controls; null otherwise.</summary>
    Recap? GetById(Guid recapId, string ownerId);

    /// <summary>Anonymous lookup for the unlisted share page. Null when the token is unknown.</summary>
    Recap? GetByShareToken(string shareToken);

    /// <summary>Adds a generated recap to a trip the owner controls; null if not owned.</summary>
    Recap? Add(Guid tripId, string ownerId, Recap recap);

    /// <summary>Saves a user edit of title/body and bumps <see cref="Recap.Version"/>; null if not owned.</summary>
    Recap? UpdateDraft(Guid recapId, string ownerId, string title, string body);

    /// <summary>Marks the recap final; null if not owned.</summary>
    Recap? Finalize(Guid recapId, string ownerId);

    /// <summary>Issues (or returns the existing) share token and records the export URL; null if not owned.</summary>
    Recap? EnsureShareToken(Guid recapId, string ownerId, Func<string, string> exportUrlForToken);

    /// <summary>Records an export destination (e.g. the PDF download path) once; null if not owned.</summary>
    Recap? RecordExportUrl(Guid recapId, string ownerId, string url);

    /// <summary>Soft-deletes a recap the owner controls.</summary>
    bool Delete(Guid recapId, string ownerId);
}
