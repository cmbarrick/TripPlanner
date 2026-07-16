using System.Text;

namespace Wander.Api.Discovery;

/// <summary>
/// Builds the grounded discovery-assistant prompt: retrieved recap excerpts labeled r1..rN, same
/// citation-by-label convention as <see cref="Wander.Api.Recaps.RecapPromptBuilder"/>. Pure logic —
/// unit-tested without calling the model.
/// </summary>
public static class DiscoveryPromptBuilder
{
    public const string SystemPrefix = """
        You are Wander's travel discovery assistant, answering a traveler's question using OTHER
        travelers' public trip recaps.
        STRICT GROUNDING RULES:
        - Answer ONLY using the recap excerpts provided below. Do not use outside knowledge.
        - NEVER invent place names, prices, opening hours, or recommendations not present in the excerpts.
        - If the excerpts don't actually answer the question, set hasAnswer to false — do not guess
          or answer a nearby-but-different question.
        - Every excerpt you draw from must be listed by its label (e.g. "r1") in sourceLabels.
        - Keep the answer concise (2-5 sentences) and cite naturally (e.g. "one traveler found...").
        """;

    public sealed record LabeledSource(string Label, Guid RecapId, string Title, string Text);

    public static string FormatContext(string question, IReadOnlyList<LabeledSource> sources)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Question: {question}");
        sb.AppendLine();
        sb.AppendLine("Public recap excerpts:");
        foreach (var source in sources)
            sb.AppendLine($"[{source.Label}] \"{source.Title}\" — {source.Text}");

        return sb.ToString().TrimEnd();
    }
}
