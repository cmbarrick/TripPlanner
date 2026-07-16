using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Realtime;
using Wander.Api.Security;

namespace Wander.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TripsController : ControllerBase
{
    private readonly ITripRepository _repo;
    private readonly ITripAccessService _access;
    private readonly ITripRealtimeNotifier _realtime;

    public TripsController(ITripRepository repo, ITripAccessService access, ITripRealtimeNotifier realtime)
    {
        _repo = repo;
        _access = access;
        _realtime = realtime;
    }

    [HttpGet]
    public ActionResult<IEnumerable<Trip>> GetAll()
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var trips = new List<Trip>();

        foreach (var owned in _repo.GetAll(ownerId))
        {
            owned.AccessRole = nameof(TripMemberRole.Owner);
            trips.Add(owned);
        }

        // Trips shared *to* this caller via membership, loaded through their real owner partition.
        foreach (var access in _access.ListMemberships(ownerId))
        {
            var shared = _repo.GetById(access.TripId, access.TripOwnerId);
            if (shared is null)
                continue;
            shared.AccessRole = access.Role.ToString();
            trips.Add(shared);
        }

        return Ok(trips.OrderBy(t => t.StartDate));
    }

    [HttpGet("{id:guid}")]
    public ActionResult<Trip> GetById(Guid id)
    {
        var (access, error) = Authorize(id, a => a.CanView);
        if (error is not null)
            return error;

        var trip = _repo.GetById(id, access!.TripOwnerId);
        if (trip is null)
            return NotFound();

        trip.AccessRole = access.Role.ToString();
        return Ok(trip);
    }

    [HttpPost]
    public ActionResult<Trip> Create([FromBody] Trip trip)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        trip.OwnerId = ownerId;
        var created = _repo.Add(trip);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id:guid}")]
    public ActionResult<Trip> Update(Guid id, [FromBody] Trip trip)
    {
        var (access, error) = Authorize(id, a => a.CanEdit);
        if (error is not null)
            return error;

        var updated = _repo.Update(id, access!.TripOwnerId, trip);
        if (updated is null)
            return NotFound();

        Notify(id, "trip");
        return Ok(updated);
    }

    [HttpDelete("{id:guid}")]
    public IActionResult Delete(Guid id)
    {
        // Deleting a trip is an owner-only action, not an editor capability.
        var (access, error) = Authorize(id, a => a.CanManage);
        if (error is not null)
            return error;

        if (!_repo.Delete(id, access!.TripOwnerId))
            return NotFound();

        Notify(id, "trip");
        return NoContent();
    }

    [HttpPost("{tripId:guid}/days/{dayId:guid}/items")]
    public ActionResult<ItineraryItem> AddItem(Guid tripId, Guid dayId, [FromBody] ItineraryItem item)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        var created = _repo.AddItem(tripId, access!.TripOwnerId, dayId, item);
        if (created is null)
            return NotFound();

        Notify(tripId, "items");
        return Ok(created);
    }

    [HttpPost("{tripId:guid}/items")]
    public ActionResult<ItineraryItem> AddWishlistItem(Guid tripId, [FromBody] ItineraryItem item)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        var created = _repo.AddUnscheduledItem(tripId, access!.TripOwnerId, item);
        if (created is null)
            return NotFound();

        Notify(tripId, "items");
        return Ok(created);
    }

    [HttpPut("{tripId:guid}/items/{itemId:guid}")]
    public ActionResult<ItineraryItem> UpdateItem(Guid tripId, Guid itemId, [FromBody] ItineraryItem item)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        var updated = _repo.UpdateItem(tripId, access!.TripOwnerId, itemId, item);
        if (updated is null)
            return NotFound();

        Notify(tripId, "items");
        return Ok(updated);
    }

    [HttpDelete("{tripId:guid}/items/{itemId:guid}")]
    public IActionResult DeleteItem(Guid tripId, Guid itemId)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        if (!_repo.DeleteItem(tripId, access!.TripOwnerId, itemId))
            return NotFound();

        Notify(tripId, "items");
        return NoContent();
    }

    [HttpPut("{tripId:guid}/items/{itemId:guid}/status")]
    public ActionResult<ItineraryItem> SetItemStatus(Guid tripId, Guid itemId, [FromBody] ItemStatusRequest request)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        var updated = _repo.SetItemStatus(tripId, access!.TripOwnerId, itemId, request.Status);
        if (updated is null)
            return NotFound();

        Notify(tripId, "items");
        return Ok(updated);
    }

    [HttpPut("{tripId:guid}/days/{dayId:guid}/items/order")]
    public IActionResult ReorderDayItems(Guid tripId, Guid dayId, [FromBody] ReorderRequest request)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        var itemIds = request.ItemIds ?? [];
        if (!_repo.ReorderDayItems(tripId, access!.TripOwnerId, dayId, itemIds))
            return NotFound();

        Notify(tripId, "items");
        return NoContent();
    }

    [HttpPut("{tripId:guid}/items/order")]
    public IActionResult ReorderBacklog(Guid tripId, [FromBody] ReorderRequest request)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        var itemIds = request.ItemIds ?? [];
        if (!_repo.ReorderDayItems(tripId, access!.TripOwnerId, null, itemIds))
            return NotFound();

        Notify(tripId, "items");
        return NoContent();
    }

    [HttpPut("{tripId:guid}/items/{itemId:guid}/move")]
    public ActionResult<ItineraryItem> MoveItem(Guid tripId, Guid itemId, [FromBody] MoveItemRequest request)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        // TargetDayId == null moves the item to the trip backlog.
        var moved = _repo.MoveItem(tripId, access!.TripOwnerId, itemId, request.TargetDayId);
        if (moved is null)
            return NotFound();

        Notify(tripId, "items");
        return Ok(moved);
    }

    [HttpGet("{tripId:guid}/packing")]
    public ActionResult<IEnumerable<PackingItem>> GetPacking(Guid tripId)
    {
        var (access, error) = Authorize(tripId, a => a.CanView);
        if (error is not null)
            return error;

        return Ok(_repo.GetPackingItems(tripId, access!.TripOwnerId));
    }

    [HttpPost("{tripId:guid}/packing")]
    public ActionResult<PackingItem> AddPacking(Guid tripId, [FromBody] PackingItemRequest request)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        var created = _repo.AddPackingItem(tripId, access!.TripOwnerId, request.Name.Trim());
        if (created is null)
            return NotFound();

        Notify(tripId, "packing");
        return Ok(created);
    }

    [HttpPut("{tripId:guid}/packing/{packingItemId:guid}")]
    public ActionResult<PackingItem> SetPacking(Guid tripId, Guid packingItemId, [FromBody] PackingToggleRequest request)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        var updated = _repo.SetPackingItemPacked(tripId, access!.TripOwnerId, packingItemId, request.IsPacked);
        if (updated is null)
            return NotFound();

        Notify(tripId, "packing");
        return Ok(updated);
    }

    [HttpDelete("{tripId:guid}/packing/{packingItemId:guid}")]
    public IActionResult DeletePacking(Guid tripId, Guid packingItemId)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        if (!_repo.DeletePackingItem(tripId, access!.TripOwnerId, packingItemId))
            return NotFound();

        Notify(tripId, "packing");
        return NoContent();
    }

    /// <summary>
    /// Resolves the caller's access to <paramref name="tripId"/> and checks the required capability.
    /// Returns <c>NotFound</c> (not <c>Forbid</c>) when there is no access at all, so trip existence
    /// isn't leaked; returns <c>Forbid</c> when the caller has access but lacks the capability.
    /// </summary>
    private (TripAccess? access, ActionResult? error) Authorize(Guid tripId, Func<TripAccess, bool> allowed)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return (null, Unauthorized());

        var access = _access.Resolve(tripId, ownerId);
        if (access is null)
            return (null, NotFound());

        return allowed(access) ? (access, null) : (null, Forbid());
    }

    // Best-effort realtime broadcast to co-editors; the write has already committed.
    private void Notify(Guid tripId, string changeKind) =>
        _realtime.NotifyTripChanged(tripId, changeKind, User.GetUserId());
}

public record ReorderRequest(List<Guid> ItemIds);

public record MoveItemRequest(Guid? TargetDayId);

public record ItemStatusRequest(ItineraryItemStatus Status);

public class PackingItemRequest
{
    [Required(AllowEmptyStrings = false, ErrorMessage = "Name is required.")]
    [StringLength(200, MinimumLength = 1)]
    public string Name { get; set; } = string.Empty;
}

public record PackingToggleRequest(bool IsPacked);
