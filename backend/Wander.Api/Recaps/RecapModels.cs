using Wander.Api.Data;
using Wander.Api.Models;

namespace Wander.Api.Recaps;

public sealed record GenerateRecapRequest(RecapScope Scope, Guid? TargetId, RecapTone Tone);

public sealed record UpdateRecapRequest(string Title, string Body);

/// <summary>Discovery facets set when publishing (Phase 8, Slice 0) — all optional. Set
/// <see cref="AcknowledgePii"/> to publish anyway after reviewing a prior attempt's findings.</summary>
public sealed record PublishRecapRequest(
    IReadOnlyList<string>? Places = null,
    IReadOnlyList<string>? Tags = null,
    string? Season = null,
    string? BudgetBand = null,
    bool AcknowledgePii = false);

public sealed record PublicRecapDto(
    Guid Id,
    Guid RecapId,
    Guid TripId,
    ModerationStatus ModerationStatus,
    string? ModerationReason,
    IReadOnlyList<string> Places,
    IReadOnlyList<string> Tags,
    string? Season,
    string? BudgetBand,
    DateTimeOffset PublishedAt);

/// <summary>Returned instead of a <see cref="PublicRecapDto"/> when PII is found and not yet
/// acknowledged — nothing was published. The client shows these for a redaction review.</summary>
public sealed record PiiReviewRequiredDto(IReadOnlyList<PiiFinding> Findings);

/// <summary>One generated section with the journal notes that grounded it (citation linkage).</summary>
public sealed record RecapSectionDto(string Heading, string Body, IReadOnlyList<Guid> NoteIds);

public sealed record RecapDto(
    Guid Id,
    Guid TripId,
    RecapScope Scope,
    Guid? TargetId,
    RecapTone Tone,
    string Title,
    string Body,
    IReadOnlyList<RecapSectionDto> Sections,
    IReadOnlyList<Guid> GeneratedFromNoteIds,
    RecapStatus Status,
    int Version,
    string? ShareUrl,
    IReadOnlyList<string> ExportUrls,
    int TokensUsed,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed class RecapParseException : Exception
{
    public RecapParseException(string message) : base(message) { }
}

/// <summary>Generation rejected because the selected scope has no notes/transcripts to ground on.</summary>
public sealed class RecapNoSourceNotesException : Exception
{
    public RecapNoSourceNotesException()
        : base("No journal notes or transcripts found for this scope — write a note first.") { }
}
