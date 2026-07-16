using Wander.Api.Data;

namespace Wander.Api.Tests;

public class PiiDetectionTests
{
    private readonly RegexPiiDetectionService _svc = new();

    [Fact]
    public void Detect_FindsEmail()
    {
        var findings = _svc.Detect("Reach me at traveler@example.com for tips.");

        var finding = Assert.Single(findings);
        Assert.Equal(PiiType.Email, finding.Type);
        Assert.Equal("traveler@example.com", finding.Value);
    }

    [Fact]
    public void Detect_FindsPhoneNumber()
    {
        var findings = _svc.Detect("Call the guide at 555-123-4567 to book.");

        var finding = Assert.Single(findings);
        Assert.Equal(PiiType.Phone, finding.Type);
        Assert.Equal("555-123-4567", finding.Value);
    }

    [Fact]
    public void Detect_FindsMultiple()
    {
        var findings = _svc.Detect("Email me at a@b.com or call (555) 123-4567.");

        Assert.Equal(2, findings.Count);
        Assert.Contains(findings, f => f.Type == PiiType.Email);
        Assert.Contains(findings, f => f.Type == PiiType.Phone);
    }

    [Fact]
    public void Detect_CleanText_ReturnsEmpty()
    {
        Assert.Empty(_svc.Detect("We had a wonderful time hiking and eating great food."));
    }

    [Fact]
    public void Detect_EmptyOrWhitespace_ReturnsEmpty()
    {
        Assert.Empty(_svc.Detect(""));
        Assert.Empty(_svc.Detect("   "));
    }
}
