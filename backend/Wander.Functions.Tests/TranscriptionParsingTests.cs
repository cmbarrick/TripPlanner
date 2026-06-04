using Wander.Functions.Transcription;

namespace Wander.Functions.Tests;

public class TranscriptionParsingTests
{
    [Fact]
    public void ParseCombinedText_ReturnsJoinedTranscript()
    {
        const string json = """
        {
          "durationMilliseconds": 4200,
          "combinedPhrases": [ { "text": "Loved the gelato near the Pantheon." } ],
          "phrases": [ { "text": "Loved the gelato near the Pantheon.", "offsetMilliseconds": 120 } ]
        }
        """;

        Assert.Equal("Loved the gelato near the Pantheon.", AzureSpeechTranscriptionService.ParseCombinedText(json));
    }

    [Fact]
    public void ParseCombinedText_NoCombinedPhrases_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, AzureSpeechTranscriptionService.ParseCombinedText("""{ "phrases": [] }"""));
    }

    [Fact]
    public void ParseCombinedText_EmptyCombinedArray_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, AzureSpeechTranscriptionService.ParseCombinedText("""{ "combinedPhrases": [] }"""));
    }
}
