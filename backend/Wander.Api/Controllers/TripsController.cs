using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Security;

namespace Wander.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TripsController : ControllerBase
{
    private readonly ITripRepository _repo;
    private readonly ITripAccessService _access;

    public TripsController(ITripRepository repo, ITripAccessService access)
    {
        _repo = repo;
        _access = access;
    }

    [HttpGet]
    public ActionResult<IEnumerable<Trip>> GetAll()
    {
        var ownerId = User.GetUserId();
        return ownerId is null ? Unauthorized() : Ok(_repo.GetAll(ownerId));
    }

    [HttpGet("{id:guid}")]
    public ActionResult<Trip> GetById(Guid id)
    {
        var (access, error) = Authorize(id, a => a.CanView);
        if (error is not null)
            return error;

        var trip = _repo.GetById(id, access!.TripOwnerId);
        return trip is null ? NotFound() : Ok(trip);
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
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id:guid}")]
    public IActionResult Delete(Guid id)
    {
        // Deleting a trip is an owner-only action, not an editor capability.
        var (access, error) = Authorize(id, a => a.CanManage);
        if (error is not null)
            return error;

        return _repo.Delete(id, access!.TripOwnerId) ? NoContent() : NotFound();
    }

    [HttpPost("{tripId:guid}/days/{dayId:guid}/items")]
    public ActionResult<ItineraryItem> AddItem(Guid tripId, Guid dayId, [FromBody] ItineraryItem item)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        var created = _repo.AddItem(tripId, access!.TripOwnerId, dayId, item);
        return created is null ? NotFound() : Ok(created);
    }

    [HttpPost("{tripId:guid}/items")]
    public ActionResult<ItineraryItem> AddWishlistItem(Guid tripId, [FromBody] ItineraryItem item)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        var created = _repo.AddUnscheduledItem(tripId, access!.TripOwnerId, item);
        return created is null ? NotFound() : Ok(created);
    }

    [HttpPut("{tripId:guid}/items/{itemId:guid}")]
    public ActionResult<ItineraryItem> UpdateItem(Guid tripId, Guid itemId, [FromBody] ItineraryItem item)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        var updated = _repo.UpdateItem(tripId, access!.TripOwnerId, itemId, item);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{tripId:guid}/items/{itemId:guid}")]
    public IActionResult DeleteItem(Guid tripId, Guid itemId)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        return _repo.DeleteItem(tripId, access!.TripOwnerId, itemId) ? NoContent() : NotFound();
    }

    [HttpPut("{tripId:guid}/items/{itemId:guid}/status")]
    public ActionResult<ItineraryItem> SetItemStatus(Guid tripId, Guid itemId, [FromBody] ItemStatusRequest request)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        var updated = _repo.SetItemStatus(tripId, access!.TripOwnerId, itemId, request.Status);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpPut("{tripId:guid}/days/{dayId:guid}/items/order")]
    public IActionResult ReorderDayItems(Guid tripId, Guid dayId, [FromBody] ReorderRequest request)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        var itemIds = request.ItemIds ?? [];
        return _repo.ReorderDayItems(tripId, access!.TripOwnerId, dayId, itemIds) ? NoContent() : NotFound();
    }

    [HttpPut("{tripId:guid}/items/order")]
    public IActionResult ReorderBacklog(Guid tripId, [FromBody] ReorderRequest request)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        var itemIds = request.ItemIds ?? [];
        return _repo.ReorderDayItems(tripId, access!.TripOwnerId, null, itemIds) ? NoContent() : NotFound();
    }

    [HttpPut("{tripId:guid}/items/{itemId:guid}/move")]
    public ActionResult<ItineraryItem> MoveItem(Guid tripId, Guid itemId, [FromBody] MoveItemRequest request)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        // TargetDayId == null moves the item to the trip backlog.
        var moved = _repo.MoveItem(tripId, access!.TripOwnerId, itemId, request.TargetDayId);
        return moved is null ? NotFound() : Ok(moved);
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
        return created is null ? NotFound() : Ok(created);
    }

    [HttpPut("{tripId:guid}/packing/{packingItemId:guid}")]
    public ActionResult<PackingItem> SetPacking(Guid tripId, Guid packingItemId, [FromBody] PackingToggleRequest request)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        var updated = _repo.SetPackingItemPacked(tripId, access!.TripOwnerId, packingItemId, request.IsPacked);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{tripId:guid}/packing/{packingItemId:guid}")]
    public IActionResult DeletePacking(Guid tripId, Guid packingItemId)
    {
        var (access, error) = Authorize(tripId, a => a.CanEdit);
        if (error is not null)
            return error;

        return _repo.DeletePackingItem(tripId, access!.TripOwnerId, packingItemId) ? NoContent() : NotFound();
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
