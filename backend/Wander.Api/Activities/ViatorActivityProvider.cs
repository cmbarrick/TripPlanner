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
/// (docs.viator.com/partner-api/technical/). <b>Response field names verified 2026-07-19</b>
/// against live sandbox responses: <c>title</c>, <c>description</c>, <c>productCode</c>,
/// <c>productUrl</c>, <c>pricing.summary.fromPrice</c>/<c>pricing.currency</c>, and
/// <c>reviews.combinedAverageRating</c> all matched on <c>/search/freetext</c> exactly as
/// originally guessed. Two things did not: images nest URLs under <c>images[].variants[]</c> by
/// size rather than a flat <c>images[].url</c> (fixed below — picks the cover image's largest
/// variant); and <b><c>/products/{{code}}</c> (used by <see cref="GetDetailsAsync"/>) has no price
/// field at all under Basic Access</b> — only <c>pricingInfo</c> (age bands/booking type, not a
/// price). That means <see cref="AiToolExecutor.AddItem"/>'s "prefill cost from the re-resolved
/// provider option" behavior will only ever fill a price when talking to
/// <see cref="FakeActivityProvider"/>; against the real API, cost stays null unless the model
/// separately supplies one, which is <c>ActivityOption</c>'s nullable design absorbing it (no
/// crash), just not the originally-intended UX. Every field remains nullable/optional so any
/// future field-name drift degrades the same way.
/// </summary>
public class ViatorActivityProvider : IActivityProvider
{
    // Sandbox is the default because a sandbox key only works against the sandbox host (and
    // vice versa) — set Activities:ViatorBaseUrl to "https://api.viator.com/partner/" once
    // switching to a production key. Trailing slash matters: HttpClient.BaseAddress combines
    // with a relative request URI via `new Uri(base, relative)`, which drops the base's last path
    // segment ("partner") when it isn't slash-terminated — silently hitting the wrong host
    // (`api.sandbox.viator.com/search/freetext`, a 404) instead of `.../partner/search/freetext`.
    // Discovered live: requests "succeeded" with an unhandled 404 swallowed by the
    // `!res.IsSuccessStatusCode -> return []` branch below, so search silently always returned zero
    // results instead of erroring.
    private const string SandboxBaseUrl = "https://api.sandbox.viator.com/partner/";

    private readonly HttpClient _http;
    private readonly string? _partnerId;

    public ViatorActivityProvider(HttpClient http, IConfiguration config)
    {
        _http = http;
        var apiKey = config["Activities:ViatorApiKey"]
            ?? throw new InvalidOperationException("Activities:ViatorApiKey must be configured.");
        _partnerId = config["Activities:ViatorPartnerId"];
        var baseUrl = string.IsNullOrWhiteSpace(config["Activities:ViatorBaseUrl"])
            ? SandboxBaseUrl
            : config["Activities:ViatorBaseUrl"]!;
        if (!baseUrl.EndsWith('/'))
            baseUrl += "/";

        _http.BaseAddress = new Uri(baseUrl);
        _http.DefaultRequestHeaders.Add("exp-api-key", apiKey);
        _http.DefaultRequestHeaders.Accept.Clear();
        _http.DefaultRequestHeaders.Accept.Add(MediaTypeWithQualityHeaderValue.Parse("application/json;version=2.0"));
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
            ImageUrl: SelectImageUrl(p.Images),
            Rating: p.Reviews?.CombinedAverageRating);
    }

    private static string? SelectImageUrl(List<ViatorImage>? images)
    {
        var image = images?.FirstOrDefault(i => i.IsCover) ?? images?.FirstOrDefault();
        return image?.Variants?.OrderByDescending(v => v.Width).FirstOrDefault()?.Url;
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
        [property: JsonPropertyName("isCover")] bool IsCover,
        [property: JsonPropertyName("variants")] List<ViatorImageVariant>? Variants);

    private record ViatorImageVariant(
        [property: JsonPropertyName("width")] int Width,
        [property: JsonPropertyName("url")] string? Url);

    private record ViatorReviews(
        [property: JsonPropertyName("combinedAverageRating")] double? CombinedAverageRating);
}
