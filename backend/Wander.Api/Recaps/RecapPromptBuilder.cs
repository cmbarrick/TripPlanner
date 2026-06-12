using System.Text;
using Wander.Api.Models;

namespace Wander.Api.Recaps;

/// <summary>
/// Builds the grounded recap prompt: stable system rules first, then the variable trip/notes
/// context. Notes are labeled n1..nN so the model cites sources by label; the validator maps
/// labels back to note ids and drops anything the model invents. Pure logic — unit-tested
/// without calling the model.
/// </summary>
public static class RecapPromptBuilder
{
    /// <summary>Stable grounding rules (identical across requests for prompt caching).</summary>
    public const string SystemPrefix = """
        You are Wander, writing a travel recap for the traveler who lived it.
        STRICT GROUNDING RULES:
        - Write ONLY from the traveler's journal notes and voice transcripts provided below.
        - You may also use the itinerary facts (place names, dates, times) and the weather facts provided.
        - NEVER invent events, meals, people, emotions, prices, or bookings that are not in the notes.
        - If the notes say little, write little — a short faithful recap beats an embellished one.
        - Write in first person, past tense, in the traveler's voice.
        - Every section must list the note labels (e.g. "n1") it draws from in noteIds.
        """;

    public static string ToneInstruction(RecapTone tone) => tone switch
    {
        RecapTone.Highlights => "Format: 2-5 short highlight sections, each a heading plus one tight paragraph of the best moments.",
        RecapTone.Bullets => "Format: sections with concise bullet lines (markdown '-' bullets in the body), no long prose.",
        _ => "Format: a flowing narrative story in 1-4 sections with natural headings.",
    };

    /// <summary>A note labeled for citation. <paramref name="Anchor"/> is where it was captured
    /// (e.g. "Day 2 — Colosseum tour").</summary>
    public sealed record LabeledNote(string Label, Guid NoteId, string Anchor, string Text);

    /// <summary>
    /// Flattens notes (body text + any voice transcripts) into citation-labeled prompt lines.
    /// Notes with no usable text are skipped.
    /// </summary>
    public static IReadOnlyList<LabeledNote> LabelNotes(
        IEnumerable<Note> notes,
        Func<Note, string> anchorFor)
    {
        var labeled = new List<LabeledNote>();
        foreach (var note in notes.OrderBy(n => n.CreatedAt))
        {
            var parts = new List<string>();
            if (!string.IsNullOrWhiteSpace(note.PromptText))
                parts.Add($"(Prompt: {note.PromptText.Trim()})");
            if (!string.IsNullOrWhiteSpace(note.BodyText))
                parts.Add(note.BodyText.Trim());
            foreach (var media in note.MediaAssets)
            {
                if (media.Kind == MediaAssetKind.Audio && !string.IsNullOrWhiteSpace(media.Transcript))
                    parts.Add($"(Voice transcript) {media.Transcript.Trim()}");
            }

            if (parts.Count == 0)
                continue;

            labeled.Add(new LabeledNote(
                $"n{labeled.Count + 1}",
                note.Id,
                anchorFor(note),
                string.Join(" ", parts)));
        }

        return labeled;
    }

    public static string FormatContext(
        Trip trip,
        RecapScope scope,
        string scopeDescription,
        IReadOnlyList<string> itineraryLines,
        IReadOnlyList<LabeledNote> notes,
        IReadOnlyList<string> weatherLines)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Trip: {trip.Title} — {trip.Destination}");
        sb.AppendLine($"Dates: {trip.StartDate:yyyy-MM-dd} to {trip.EndDate:yyyy-MM-dd}");
        sb.AppendLine($"Recap scope: {scopeDescription}");

        if (itineraryLines.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("Itinerary (context only — do not narrate stops that have no notes):");
            foreach (var line in itineraryLines)
                sb.AppendLine($"- {line}");
        }

        if (weatherLines.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("Actual weather on the days visited (you may reference these facts):");
            foreach (var line in weatherLines)
                sb.AppendLine($"- {line}");
        }

        sb.AppendLine();
        sb.AppendLine("Journal notes and transcripts (the ONLY source of experiences):");
        foreach (var note in notes)
            sb.AppendLine($"[{note.Label}] ({note.Anchor}) {note.Text}");

        return sb.ToString().TrimEnd();
    }
}
