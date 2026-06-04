using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace Wander.Functions.Transcription;

/// <summary>
/// Transcribes audio with Azure AI Speech's <b>fast transcription</b> REST API
/// (<c>/speechtotext/transcriptions:transcribe</c>). The REST path accepts common compressed
/// formats (m4a/mp3/wav…) directly, so we avoid the Speech SDK's native codec dependencies in the
/// Functions sandbox. Config: <c>Speech:Endpoint</c> (regional endpoint) + <c>Speech:Key</c>.
/// </summary>
public sealed class AzureSpeechTranscriptionService : ITranscriptionService
{
    private const string ApiVersion = "2024-11-15";

    private readonly IHttpClientFactory _httpFactory;
    private readonly string _endpoint;
    private readonly string _key;

    public AzureSpeechTranscriptionService(IHttpClientFactory httpFactory, IConfiguration config)
    {
        _httpFactory = httpFactory;
        _endpoint = (config["Speech:Endpoint"] ?? string.Empty).TrimEnd('/');
        _key = config["Speech:Key"] ?? string.Empty;
    }

    public async Task<string> TranscribeAsync(Stream audio, string fileName, string locale, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(_endpoint) || string.IsNullOrEmpty(_key))
            throw new InvalidOperationException("Speech:Endpoint and Speech:Key must be configured.");

        using var content = new MultipartFormDataContent();

        var audioContent = new StreamContent(audio);
        audioContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        content.Add(audioContent, "audio", fileName);

        var definition = JsonSerializer.Serialize(new { locales = new[] { locale } });
        content.Add(new StringContent(definition, Encoding.UTF8, "application/json"), "definition");

        var url = $"{_endpoint}/speechtotext/transcriptions:transcribe?api-version={ApiVersion}";
        using var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };
        request.Headers.Add("Ocp-Apim-Subscription-Key", _key);

        var http = _httpFactory.CreateClient();
        using var response = await http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync(ct);
        return ParseCombinedText(json);
    }

    /// <summary>Extracts the joined transcript text from a fast-transcription JSON response.
    /// Pure/static so it can be unit-tested without a live Speech resource.</summary>
    public static string ParseCombinedText(string json)
    {
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.TryGetProperty("combinedPhrases", out var combined)
            && combined.ValueKind == JsonValueKind.Array
            && combined.GetArrayLength() > 0
            && combined[0].TryGetProperty("text", out var text))
        {
            return text.GetString() ?? string.Empty;
        }

        return string.Empty;
    }
}
