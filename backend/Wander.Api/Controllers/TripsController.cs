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

    public TripsController(ITripRepository repo) => _repo = repo;

    [HttpGet]
    public ActionResult<IEnumerable<Trip>> GetAll()
    {
        var ownerId = User.GetUserId();
        return ownerId is null ? Unauthorized() : Ok(_repo.GetAll(ownerId));
    }

    [HttpGet("{id:guid}")]
    public ActionResult<Trip> GetById(Guid id)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var trip = _repo.GetById(id, ownerId);
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
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var updated = _repo.Update(id, ownerId, trip);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id:guid}")]
    public IActionResult Delete(Guid id)
    {
        var ownerId = User.GetUserId();
        return ownerId is null
            ? Unauthorized()
            : (_repo.Delete(id, ownerId) ? NoContent() : NotFound());
    }

    [HttpPost("{tripId:guid}/days/{dayId:guid}/items")]
    public ActionResult<ItineraryItem> AddItem(Guid tripId, Guid dayId, [FromBody] ItineraryItem item)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var created = _repo.AddItem(tripId, ownerId, dayId, item);
        return created is null ? NotFound() : Ok(created);
    }

    [HttpPut("{tripId:guid}/items/{itemId:guid}")]
    public ActionResult<ItineraryItem> UpdateItem(Guid tripId, Guid itemId, [FromBody] ItineraryItem item)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var updated = _repo.UpdateItem(tripId, ownerId, itemId, item);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{tripId:guid}/items/{itemId:guid}")]
    public IActionResult DeleteItem(Guid tripId, Guid itemId)
    {
        var ownerId = User.GetUserId();
        return ownerId is null
            ? Unauthorized()
            : (_repo.DeleteItem(tripId, ownerId, itemId) ? NoContent() : NotFound());
    }

    [HttpPut("{tripId:guid}/days/{dayId:guid}/items/order")]
    public IActionResult ReorderDayItems(Guid tripId, Guid dayId, [FromBody] ReorderRequest request)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var itemIds = request.ItemIds ?? [];
        return _repo.ReorderDayItems(tripId, ownerId, dayId, itemIds) ? NoContent() : NotFound();
    }

    [HttpPut("{tripId:guid}/items/{itemId:guid}/move")]
    public ActionResult<ItineraryItem> MoveItem(Guid tripId, Guid itemId, [FromBody] MoveItemRequest request)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var moved = _repo.MoveItem(tripId, ownerId, itemId, request.TargetDayId);
        return moved is null ? NotFound() : Ok(moved);
    }

    [HttpGet("{tripId:guid}/packing")]
    public ActionResult<IEnumerable<PackingItem>> GetPacking(Guid tripId)
    {
        var ownerId = User.GetUserId();
        return ownerId is null ? Unauthorized() : Ok(_repo.GetPackingItems(tripId, ownerId));
    }

    [HttpPost("{tripId:guid}/packing")]
    public ActionResult<PackingItem> AddPacking(Guid tripId, [FromBody] PackingItemRequest request)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var created = _repo.AddPackingItem(tripId, ownerId, request.Name.Trim());
        return created is null ? NotFound() : Ok(created);
    }

    [HttpPut("{tripId:guid}/packing/{packingItemId:guid}")]
    public ActionResult<PackingItem> SetPacking(Guid tripId, Guid packingItemId, [FromBody] PackingToggleRequest request)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null)
            return Unauthorized();

        var updated = _repo.SetPackingItemPacked(tripId, ownerId, packingItemId, request.IsPacked);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{tripId:guid}/packing/{packingItemId:guid}")]
    public IActionResult DeletePacking(Guid tripId, Guid packingItemId)
    {
        var ownerId = User.GetUserId();
        return ownerId is null
            ? Unauthorized()
            : (_repo.DeletePackingItem(tripId, ownerId, packingItemId) ? NoContent() : NotFound());
    }
}

public record ReorderRequest(List<Guid> ItemIds);

public record MoveItemRequest(Guid TargetDayId);

public class PackingItemRequest
{
    [Required(AllowEmptyStrings = false, ErrorMessage = "Name is required.")]
    [StringLength(200, MinimumLength = 1)]
    public string Name { get; set; } = string.Empty;
}

public record PackingToggleRequest(bool IsPacked);
