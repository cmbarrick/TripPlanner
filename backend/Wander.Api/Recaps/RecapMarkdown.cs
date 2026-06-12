namespace Wander.Api.Recaps;

/// <summary>
/// Minimal markdown-block parser for recap bodies (the composer only emits headings, bullets,
/// and paragraphs — see <see cref="RecapValidator.ComposeBody"/>). Shared by the PDF and share-page
/// renderers so both exports lay out the same structure.
/// </summary>
public static class RecapMarkdown
{
    public abstract record Block;
    public sealed record Heading(string Text) : Block;
    public sealed record Bullet(string Text) : Block;
    public sealed record Paragraph(string Text) : Block;

    public static IReadOnlyList<Block> Parse(string body)
    {
        var blocks = new List<Block>();
        var paragraph = new List<string>();

        void FlushParagraph()
        {
            if (paragraph.Count > 0)
            {
                blocks.Add(new Paragraph(string.Join(" ", paragraph)));
                paragraph.Clear();
            }
        }

        foreach (var raw in body.Replace("\r\n", "\n").Split('\n'))
        {
            var line = raw.Trim();
            if (line.Length == 0)
            {
                FlushParagraph();
            }
            else if (line.StartsWith('#'))
            {
                FlushParagraph();
                blocks.Add(new Heading(line.TrimStart('#').Trim()));
            }
            else if (line.StartsWith("- ") || line.StartsWith("* "))
            {
                FlushParagraph();
                blocks.Add(new Bullet(line[2..].Trim()));
            }
            else
            {
                paragraph.Add(line);
            }
        }

        FlushParagraph();
        return blocks;
    }
}
