namespace Wander.Api.Data;

/// <summary>Thrown when an update's supplied <c>Version</c> no longer matches the row's current
/// <c>xmin</c> — someone else updated it since the caller last read it. Controllers catch this and
/// return 409 rather than letting EF Core's <see cref="Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException"/>
/// surface as an unhandled 500.</summary>
public sealed class ConcurrencyConflictException : Exception
{
    public ConcurrencyConflictException()
        : base("This was changed by someone else since you last loaded it.") { }
}
