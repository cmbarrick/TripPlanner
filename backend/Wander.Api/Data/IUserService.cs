using Microsoft.EntityFrameworkCore;
using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>
/// Bridges the runtime auth identity (the <c>sub</c> string carried as <c>OwnerId</c>) to the
/// internal <see cref="User"/> row (<c>Users.Id</c> Guid) that membership/consent tables reference.
/// </summary>
public interface IUserService
{
    /// <summary>Returns the internal user id for an auth subject, or <c>null</c> if none exists yet.</summary>
    Guid? FindUserId(string ownerId);

    /// <summary>Returns the existing user for an auth subject, creating one on first use.</summary>
    User GetOrCreate(string ownerId);
}

public class UserService(WanderDbContext db) : IUserService
{
    public Guid? FindUserId(string ownerId) =>
        db.Users.AsNoTracking()
            .Where(u => u.OwnerId == ownerId && u.DeletedAt == null)
            .Select(u => (Guid?)u.Id)
            .FirstOrDefault();

    public User GetOrCreate(string ownerId)
    {
        var user = db.Users.SingleOrDefault(u => u.OwnerId == ownerId && u.DeletedAt == null);
        if (user is not null)
            return user;

        user = new User
        {
            OwnerId = ownerId,
            SubjectId = ownerId,
            Email = DevEmail(ownerId),
            DisplayName = "Traveler",
        };
        db.Users.Add(user);
        db.SaveChanges();
        return user;
    }

    // Mirrors PreferenceService: synthesizes a unique placeholder email for the dev/local identity
    // so the Users.Email unique index is satisfied until real profile data arrives.
    private static string DevEmail(string ownerId)
    {
        var local = ownerId.Replace('@', '_').Replace(' ', '_');
        if (local.Length > 120)
            local = local[..120];
        return $"{local}@users.wander";
    }
}
