using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;

namespace Wander.Api.Activities;

/// <summary>
/// Calls Viator's Partner API (Basic-Access affiliate tier — no traffic-minimum gate, unlike
/// GetYourGuide's partner program, which requires 100k+ monthly visits even for its lowest tier).
/// Reads the API key from <c>Activities:ViatorApiKey</c> in configuration (env var /
/// user-secrets / Key Vault) and, when set, the affiliate campaign id from
/// <c>Activities:ViatorPartnerId</c> (appended to booking links so referrals are attributed).
///
/// The request shapes below (endpoint paths, headers, the <c>/search/freetext</c> body) are
/// confirmed against Viator's official "Basic-Access Affiliate API v2" Postman collection
/// (docs.viator.com/partner-api/technical/), not guessed. <b>The response field names are still
/// unverified</b> — that collection documents requests but not example responses, and the
/// sandbox key issued for this integration hadn't finished Viator's (up to 24h) activation
/// delay as of writing, so no real response has been inspected yet. Every field on
/// <see cref="ActivityOption"/> is nullable/optional specifically so a wrong guess here degrades
/// to a missing field rather than a crash; re-verify field names (`title`, `pricing.summary.
/// fromPrice`, `images[].url`, `reviews.combinedAverageRating`, `productUrl`) against a real
/// response once the key is live.
/// </summary>
public class ViatorActivityProvider : IActivityProvider
{
    // Sandbox is the default because a sandbox key only works against the sandbox host (and
    // vice versa) — set Activities:ViatorBaseUrl to "https://api.viator.com/partner" once
    // switching to a production key.
    private const string SandboxBaseUrl = "https://api.sandbox.viator.com/partner";

    private readonly HttpClient _http;
    private readonly string? _partnerId;

    public ViatorActivityProvider(HttpClient http, IConfiguration config)
    {
        _http = http;
        var apiKey = config["Activities:ViatorApiKey"]
            ?? throw new InvalidOperationException("Activities:ViatorApiKey must be configured.");
        _partnerId = config["Activities:ViatorPartnerId"];
        var baseUrl = config["Activities:ViatorBaseUrl"];

        _http.BaseAddress = new Uri(string.IsNullOrWhiteSpace(baseUrl) ? SandboxBaseUrl : baseUrl);
        _http.DefaultRequestHeaders.Add("exp-api-key", apiKey);
        _http.DefaultRequestHeaders.Accept.Clear();
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json;version=2.0"));
        _http.DefaultRequestHeaders.AcceptLanguage.Add(new StringWithQualityHeaderValue("en-US"));
    }

    public async Task<IReadOnlyList<ActivityOption>> SearchAsync(
        string locationHint, DateOnly? date, string? query, string currency, int limit, CancellationToken ct)
    {
        // Viator's freetext search keys off a search term (typically a destination/place name)
        // rather than raw coordinates. Combine the location hint with any explicit keyword filter.
        // productFiltering.dateRange would narrow to a specific day, but that needs a `to` as well
        // as `from` (a single-day trip stop doesn't map cleanly onto a range) and Basic Access
        // availability data is limited anyway, so date is accepted for interface symmetry but not
        // sent — a future pass can add a day-wide range once that's worth the complexity.
        var searchTerm = string.IsNullOrWhiteSpace(query) ? locationHint : $"{locationHint} {query}";
        var body = new ViatorSearchRequest(
            SearchTerm: searchTerm,
            SearchTypes: [new ViatorSearchType("PRODUCTS", new ViatorPagination(1, Math.Clamp(limit, 1, 20)))],
            Currency: string.IsNullOrWhiteSpace(currency) ? "USD" : currency);

        using var res = await _http.PostAsJsonAsync("search/freetext", body, ct);
        if (!res.IsSuccessStatusCode)
            return [];

        var payload = await res.Content.ReadFromJsonAsync<ViatorSearchResponse>(cancellationToken: ct);
        var products = payload?.Products?.Results ?? [];

        return products
            .Where(p => p.ProductCode is not null && p.Title is not null)
            .Select(ToOption)
            .ToList();
    }

    public async Task<ActivityOption?> GetDetailsAsync(string activityId, CancellationToken ct)
    {
        using var res = await _http.GetAsync($"products/{Uri.EscapeDataString(activityId)}", ct);
        if (!res.IsSuccessStatusCode)
            return null;

        var product = await res.Content.ReadFromJsonAsync<ViatorProduct>(cancellationToken: ct);
        return product?.ProductCode is null || product.Title is null ? null : ToOption(product);
    }

    private ActivityOption ToOption(ViatorProduct p)
    {
        var url = p.ProductUrl ?? $"https://www.viator.com/tours/{Uri.EscapeDataString(p.ProductCode!)}";
        if (!string.IsNullOrWhiteSpace(_partnerId))
            url += (url.Contains('?') ? "&" : "?") + $"pid={Uri.EscapeDataString(_partnerId)}";

        return new ActivityOption(
            ActivityId: p.ProductCode!,
            Title: p.Title!,
            Description: p.Description,
            PriceFrom: p.Pricing?.Summary?.FromPrice,
            Currency: p.Pricing?.Currency,
            BookingUrl: url,
            ImageUrl: p.Images?.FirstOrDefault()?.Url,
            Rating: p.Reviews?.CombinedAverageRating);
    }

    // Request shape confirmed against Viator's Basic-Access Postman collection; response shape is
    // still best-effort — see the class remarks above.
    private record ViatorSearchRequest(
        [property: JsonPropertyName("searchTerm")] string SearchTerm,
        [property: JsonPropertyName("searchTypes")] List<ViatorSearchType> SearchTypes,
        [property: JsonPropertyName("currency")] string Currency);

    private record ViatorSearchType(
        [property: JsonPropertyName("searchType")] string SearchType,
        [property: JsonPropertyName("pagination")] ViatorPagination Pagination);

    private record ViatorPagination(
        [property: JsonPropertyName("start")] int Start,
        [property: JsonPropertyName("count")] int Count);

    private record ViatorSearchResponse(
        [property: JsonPropertyName("products")] ViatorProductResults? Products);

    private record ViatorProductResults(
        [property: JsonPropertyName("results")] List<ViatorProduct>? Results);

    private record ViatorProduct(
        [property: JsonPropertyName("productCode")] string? ProductCode,
        [property: JsonPropertyName("title")] string? Title,
        [property: JsonPropertyName("description")] string? Description,
        [property: JsonPropertyName("productUrl")] string? ProductUrl,
        [property: JsonPropertyName("pricing")] ViatorPricing? Pricing,
        [property: JsonPropertyName("images")] List<ViatorImage>? Images,
        [property: JsonPropertyName("reviews")] ViatorReviews? Reviews);

    private record ViatorPricing(
        [property: JsonPropertyName("summary")] ViatorPriceSummary? Summary,
        [property: JsonPropertyName("currency")] string? Currency);

    private record ViatorPriceSummary(
        [property: JsonPropertyName("fromPrice")] decimal? FromPrice);

    private record ViatorImage(
        [property: JsonPropertyName("url")] string? Url);

    private record ViatorReviews(
        [property: JsonPropertyName("combinedAverageRating")] double? CombinedAverageRating);
}
