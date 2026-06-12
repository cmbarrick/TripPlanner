using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Wander.Api.Ai;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Weather;

namespace Wander.Api.Recaps;

public interface IRecapGenerationService
{
    Task<Recap> GenerateAsync(string ownerId, Guid tripId, GenerateRecapRequest request, CancellationToken ct = default);
}

/// <summary>
/// Orchestrates recap generation: gathers the scope's notes + transcripts, adds itinerary and
/// historical-weather context, asks the model for a structured grounded draft (cheaper draft
/// deployment), validates citations, and persists a versioned <see cref="Recap"/>. Regenerating
/// with unchanged sources returns the existing draft instead of spending tokens.
/// </summary>
public sealed class RecapGenerationService(
    IAiProvider ai,
    ITripRepository trips,
    INoteRepository notes,
    IRecapRepository recaps,
    IHistoricalWeatherProvider historicalWeather,
    IAiTokenQuotaService quota) : IRecapGenerationService
{
    /// <summary>Cap on weather lookups per generation (one per distinct located day/stop).</summary>
    public const int MaxWeatherFacts = 10;

    public async Task<Recap> GenerateAsync(
        string ownerId, Guid tripId, GenerateRecapRequest request, CancellationToken ct = default)
    {
        if (!ai.IsEnabled)
            throw new InvalidOperationException("AI is not configured.");

        var trip = trips.GetById(tripId, ownerId)
            ?? throw new KeyNotFoundException("Trip not found.");

        var (scopeDescription, days, target) = ResolveScope(trip, request.Scope, request.TargetId);
        var scopedNotes = FilterNotes(
            notes.GetForTrip(tripId, ownerId), trip, request.Scope, request.TargetId);

        var labeled = RecapPromptBuilder.LabelNotes(scopedNotes, n => AnchorFor(trip, n));
        if (labeled.Count == 0)
            throw new RecapNoSourceNotesException();

        // Cost control: identical sources + tone → return the existing draft, no model call.
        var fingerprint = Fingerprint(request, scopedNotes);
        var existing = recaps.GetForTrip(tripId, ownerId).FirstOrDefault(r =>
            r.Scope == request.Scope && r.TargetId == request.TargetId && r.Tone == request.Tone &&
            r.Status == RecapStatus.Draft && r.SourceFingerprint == fingerprint);
        if (existing is not null)
            return existing;

        var snapshot = await quota.GetSnapshotAsync(ownerId, ct);
        if (snapshot.RemainingToday <= 0)
            throw new AiQuotaExceededException();

        var itineraryLines = BuildItineraryLines(days, target);
        var weatherLines = await BuildWeatherLinesAsync(days, target, ct);

        var context = RecapPromptBuilder.FormatContext(
            trip, request.Scope, scopeDescription, itineraryLines, labeled, weatherLines);
        var system = $"{RecapPromptBuilder.SystemPrefix}\n\n{RecapPromptBuilder.ToneInstruction(request.Tone)}";
        var messages = new List<AiMessage>
        {
            new(AiRole.System, system),
            new(AiRole.User, context),
        };

        var completionRequest = new AiCompletionRequest(
            messages,
            [],
            Format: AiResponseFormat.JsonSchema,
            JsonSchema: RecapSchema.JsonSchema,
            MaxOutputTokens: 4096,
            Temperature: 0.6,
            DeploymentKind: "recap");

        var (json, usage) = await CollectTextAsync(ai, completionRequest, ct);

        if (!await quota.TryRecordUsageAsync(ownerId, usage, ct))
            throw new AiQuotaExceededException();

        var noteIdsByLabel = labeled.ToDictionary(n => n.Label, n => n.NoteId);
        var parsed = RecapValidator.ParseAndValidate(json, noteIdsByLabel);

        var recap = new Recap
        {
            Scope = request.Scope,
            TargetId = request.TargetId,
            Tone = request.Tone,
            Title = parsed.Title,
            Body = RecapValidator.ComposeBody(parsed.Sections),
            SectionsJson = JsonSerializer.Serialize(parsed.Sections, AiJson.CamelCase),
            GeneratedFromNoteIds = labeled.Select(n => n.NoteId).Distinct().ToList(),
            SourceFingerprint = fingerprint,
            TokensUsed = usage.TotalTokens,
        };

        return recaps.Add(tripId, ownerId, recap)
            ?? throw new KeyNotFoundException("Trip not found.");
    }

    /// <summary>Days (and optional single event) the recap covers; throws when the target id
    /// doesn't belong to this trip.</summary>
    private static (string Description, IReadOnlyList<Day> Days, ItineraryItem? Target) ResolveScope(
        Trip trip, RecapScope scope, Guid? targetId)
    {
        switch (scope)
        {
            case RecapScope.Trip:
                return ($"the whole trip", trip.Days.OrderBy(d => d.DayNumber).ToList(), null);

            case RecapScope.Day:
                var day = trip.Days.FirstOrDefault(d => d.Id == targetId)
                    ?? throw new ArgumentException("Day not found on this trip.");
                return ($"Day {day.DayNumber} ({day.Date:yyyy-MM-dd})", [day], null);

            case RecapScope.Event:
                foreach (var d in trip.Days)
                {
                    var item = d.Items.FirstOrDefault(i => i.Id == targetId && i.DeletedAt == null);
                    if (item is not null)
                        return ($"the event \"{item.Title}\" on Day {d.DayNumber} ({d.Date:yyyy-MM-dd})", [d], item);
                }

                throw new ArgumentException("Event not found on this trip.");

            default:
                throw new ArgumentException("Unknown recap scope.");
        }
    }

    /// <summary>Notes that ground the recap: the scope's own notes, plus event notes within a
    /// day scope, plus everything for trip scope.</summary>
    private static IReadOnlyList<Note> FilterNotes(
        IEnumerable<Note> all, Trip trip, RecapScope scope, Guid? targetId)
    {
        var list = all.Where(n => n.DeletedAt == null);
        switch (scope)
        {
            case RecapScope.Trip:
                return list.ToList();

            case RecapScope.Day:
                var day = trip.Days.FirstOrDefault(d => d.Id == targetId);
                var itemIds = day?.Items.Select(i => i.Id).ToHashSet() ?? [];
                return list.Where(n =>
                    (n.Scope == NoteScope.Day && n.TargetId == targetId) ||
                    (n.Scope == NoteScope.Event && n.TargetId is { } t && itemIds.Contains(t)))
                    .ToList();

            case RecapScope.Event:
                return list.Where(n => n.Scope == NoteScope.Event && n.TargetId == targetId).ToList();

            default:
                return [];
        }
    }

    /// <summary>Where a note was captured, for the citation label (e.g. "Day 2 — Colosseum tour").</summary>
    private static string AnchorFor(Trip trip, Note note)
    {
        if (note.Scope == NoteScope.Trip)
            return "whole trip";

        if (note.Scope == NoteScope.Day)
        {
            var day = trip.Days.FirstOrDefault(d => d.Id == note.TargetId);
            return day is null ? "a day" : $"Day {day.DayNumber}, {day.Date:yyyy-MM-dd}";
        }

        foreach (var day in trip.Days)
        {
            var item = day.Items.FirstOrDefault(i => i.Id == note.TargetId);
            if (item is not null)
                return $"Day {day.DayNumber} — {item.Title}";
        }

        var idea = trip.UnscheduledItems.FirstOrDefault(i => i.Id == note.TargetId);
        return idea is null ? "an event" : idea.Title;
    }

    private static IReadOnlyList<string> BuildItineraryLines(IReadOnlyList<Day> days, ItineraryItem? target)
    {
        if (target is not null)
        {
            var when = target.StartTime is { } st ? $" at {st:HH\\:mm}" : "";
            var where = string.IsNullOrWhiteSpace(target.LocationName) ? "" : $" ({target.LocationName})";
            return [$"{target.Title}{where}{when}"];
        }

        return days
            .Select(day => AiPromptBuilder.FormatDaySummary(
                day.DayNumber,
                day.Date,
                day.Items.Where(i => i.DeletedAt == null)
                    .OrderBy(i => i.SortOrder)
                    .Select(i => i.Title)
                    .ToList()))
            .ToList();
    }

    /// <summary>Actual weather lines for past, located stops (one lookup per ~1 km/date thanks to
    /// the caching decorator; capped at <see cref="MaxWeatherFacts"/>).</summary>
    private async Task<IReadOnlyList<string>> BuildWeatherLinesAsync(
        IReadOnlyList<Day> days, ItineraryItem? target, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var lines = new List<string>();
        var seen = new HashSet<string>();

        foreach (var day in days)
        {
            if (day.Date >= today)
                continue;

            var items = target is not null
                ? new[] { target }
                : day.Items.Where(i => i.DeletedAt == null).OrderBy(i => i.SortOrder).ToArray();

            foreach (var item in items)
            {
                if (item.Latitude is not { } lat || item.Longitude is not { } lng)
                    continue;

                // Same ±1 km / date granularity as the cache key, so nearby stops share one fact.
                var dedupe = $"{Math.Round(lat, 2)}:{Math.Round(lng, 2)}:{day.Date:yyyyMMdd}";
                if (!seen.Add(dedupe))
                    continue;
                if (lines.Count >= MaxWeatherFacts)
                    return lines;

                var actuals = await historicalWeather.GetActualsAsync(lat, lng, day.Date, ct);
                if (actuals is null)
                    continue;

                var place = string.IsNullOrWhiteSpace(item.LocationName) ? item.Title : item.LocationName;
                var line = $"{day.Date:yyyy-MM-dd} at {place}: high {actuals.HighC:0.#}°C, low {actuals.LowC:0.#}°C, {WmoCodes.Describe(actuals.WeatherCode)}";

                // With a start time, add the temperature closest to that hour ("29°C at 14:00").
                if (item.StartTime is { } start && actuals.Hours.Count > 0)
                {
                    var nearest = actuals.Hours
                        .Where(h => h.Time.Length >= 13 && int.TryParse(h.Time[11..13], out _))
                        .OrderBy(h => Math.Abs(int.Parse(h.Time[11..13]) - start.Hour))
                        .FirstOrDefault();
                    if (nearest is not null)
                        line += $"; around {start:HH\\:mm} it was {nearest.TemperatureC:0.#}°C ({WmoCodes.Describe(nearest.WeatherCode)})";
                }

                lines.Add(line);
            }
        }

        return lines;
    }

    /// <summary>Stable hash of the generation inputs: scope/target/tone + each source note's id
    /// and last edit time (so editing a note invalidates the dedupe).</summary>
    private static string Fingerprint(GenerateRecapRequest request, IReadOnlyList<Note> sourceNotes)
    {
        var sb = new StringBuilder()
            .Append(request.Scope).Append('|')
            .Append(request.TargetId).Append('|')
            .Append(request.Tone);
        foreach (var note in sourceNotes.OrderBy(n => n.Id))
        {
            sb.Append('|').Append(note.Id).Append('@').Append(note.UpdatedAt.UtcTicks);
            foreach (var media in note.MediaAssets.OrderBy(m => m.Id))
                sb.Append('+').Append(media.Id).Append('@').Append(media.UpdatedAt.UtcTicks);
        }

        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(sb.ToString())));
    }

    private static async Task<(string Text, AiUsage Usage)> CollectTextAsync(
        IAiProvider provider, AiCompletionRequest request, CancellationToken ct)
    {
        var sb = new StringBuilder();
        var usage = new AiUsage(0, 0);
        await foreach (var delta in provider.CompleteAsync(request, ct))
        {
            if (delta is TextDelta text)
                sb.Append(text.Text);
            if (delta is CompletionDone done)
                usage = done.Usage;
        }

        return (sb.ToString(), usage);
    }
}
