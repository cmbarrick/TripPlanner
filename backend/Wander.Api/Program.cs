using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Azure;
using Azure.AI.OpenAI;
using Wander.Api.Ai;
using Wander.Api.Data;
using Wander.Api.Media;
using Wander.Api.Places;
using Wander.Api.Routing;
using Wander.Api.Security;
using Wander.Api.Transcription;
using Wander.Api.Weather;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

// Distributed cache for the Places/Weather provider decorators (architecture §6).
// Cloud (Phase 3+): a shared Azure Cache for Redis instance is used when
// Cache:RedisConnectionString is configured (from Key Vault), so multiple App Service
// instances share one cache and don't duplicate provider fetches.
// Local-first / CI: fall back to an in-process IDistributedCache so the app runs with
// no Redis dependency — the caching decorators are unaware of which backing store is used.
var redisConnectionString = builder.Configuration["Cache:RedisConnectionString"];
if (!string.IsNullOrWhiteSpace(redisConnectionString))
{
    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.Configuration = redisConnectionString;
        options.InstanceName = "wander:";
    });
}
else
{
    builder.Services.AddDistributedMemoryCache();
}

// Routing provider — Haversine (no key) by default; Azure Maps when key is configured.
var azureMapsKey = builder.Configuration["Routing:AzureMapsKey"];
if (!string.IsNullOrWhiteSpace(azureMapsKey))
{
    builder.Services.AddHttpClient<AzureMapsRoutingProvider>();
    builder.Services.AddScoped<IRoutingProvider>(sp =>
        new AzureMapsRoutingProvider(
            sp.GetRequiredService<IHttpClientFactory>().CreateClient(nameof(AzureMapsRoutingProvider)),
            azureMapsKey));
}
else
{
    builder.Services.AddScoped<IRoutingProvider, HaversineRoutingProvider>();
}

// Weather provider — Open-Meteo needs no key; always available.
// Swap in FakeWeatherProvider by setting Weather:UseFake=true (e.g. for integration tests
// that should not hit the network).
var useFakeWeather = builder.Configuration.GetValue<bool>("Weather:UseFake");
if (useFakeWeather)
{
    builder.Services.AddScoped<IWeatherProvider>(sp =>
        new CachingWeatherProvider(
            new FakeWeatherProvider(),
            sp.GetRequiredService<Microsoft.Extensions.Caching.Distributed.IDistributedCache>()));
}
else
{
    builder.Services.AddHttpClient<OpenMeteoWeatherProvider>();
    builder.Services.AddScoped<IWeatherProvider>(sp =>
        new CachingWeatherProvider(
            sp.GetRequiredService<OpenMeteoWeatherProvider>(),
            sp.GetRequiredService<Microsoft.Extensions.Caching.Distributed.IDistributedCache>()));
}

// Place search provider — key stays server-side. Swap MapboxPlaceProvider for
// FakePlaceProvider automatically when no access token is configured (e.g. CI).
var mapboxToken = builder.Configuration["Places:MapboxAccessToken"];
if (!string.IsNullOrWhiteSpace(mapboxToken))
{
    builder.Services.AddHttpClient<MapboxPlaceProvider>();
    builder.Services.AddScoped<IPlaceProvider>(sp =>
        new CachingPlaceProvider(
            sp.GetRequiredService<MapboxPlaceProvider>(),
            sp.GetRequiredService<Microsoft.Extensions.Caching.Distributed.IDistributedCache>()));
}
else
{
    builder.Services.AddScoped<IPlaceProvider>(sp =>
        new CachingPlaceProvider(
            new FakePlaceProvider(),
            sp.GetRequiredService<Microsoft.Extensions.Caching.Distributed.IDistributedCache>()));
}

// Application Insights (SDK 3.x is OpenTelemetry-based and validates the connection string
// eagerly at startup). Only enable it for a *valid* connection string: a non-empty but invalid
// value — e.g. an unresolved "@Microsoft.KeyVault(...)" reference during the brief RBAC
// propagation window on a brand-new environment — would otherwise crash the Azure Monitor
// exporter and take the whole app down. Skipping lets the app start; App Service re-resolves
// the reference shortly after and telemetry comes online on the next refresh/restart.
var appInsightsConnectionString = builder.Configuration["ApplicationInsights:ConnectionString"];
if (!string.IsNullOrWhiteSpace(appInsightsConnectionString)
    && appInsightsConnectionString.Contains("InstrumentationKey=", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddApplicationInsightsTelemetry(options =>
    {
        options.ConnectionString = appInsightsConnectionString;
    });
}

builder.Services.AddDbContext<WanderDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection is required.");
    options.UseNpgsql(connectionString);
});

builder.Services.AddScoped<ITripRepository, EfCoreTripRepository>();
builder.Services.AddScoped<IPreferenceService, PreferenceService>();

// AI planning assistant (Phase 5): Azure OpenAI when configured; disabled/fake otherwise.
builder.Services.Configure<AiOptions>(builder.Configuration.GetSection(AiOptions.SectionName));
builder.Services.AddScoped<IAiTokenQuotaService, AiTokenQuotaService>();
var aiSection = builder.Configuration.GetSection(AiOptions.SectionName);
var useFakeAi = aiSection.GetValue<bool>(nameof(AiOptions.UseFake));
var aiEndpoint = aiSection[nameof(AiOptions.Endpoint)];
var aiApiKey = aiSection[nameof(AiOptions.ApiKey)];
if (useFakeAi)
{
    builder.Services.AddSingleton<IAiProvider, FakeAiProvider>();
}
else if (!string.IsNullOrWhiteSpace(aiEndpoint) && !string.IsNullOrWhiteSpace(aiApiKey))
{
    builder.Services.AddSingleton(_ => new AzureOpenAIClient(new Uri(aiEndpoint), new AzureKeyCredential(aiApiKey)));
    builder.Services.AddSingleton<IAiProvider, AzureOpenAiProvider>();
}
else
{
    builder.Services.AddSingleton<IAiProvider, DisabledAiProvider>();
}

// Notes & journaling (Phase 4): media blobs + async voice-note transcription.
// Cloud: Azure Blob Storage + an Azure Storage queue (drained by the transcription Function) when
// Storage:ConnectionString is set. Local-first / CI: a filesystem blob store and a no-op queue so
// the app runs with no Azure Storage dependency (audio is stored, just not transcribed).
builder.Services.AddScoped<INoteRepository, EfCoreNoteRepository>();
var storageConnectionString = builder.Configuration["Storage:ConnectionString"];
var mediaContainer = builder.Configuration["Storage:MediaContainer"] ?? "media";
if (!string.IsNullOrWhiteSpace(storageConnectionString))
{
    builder.Services.AddSingleton<IBlobStore>(_ => new AzureBlobStore(storageConnectionString, mediaContainer));
    builder.Services.AddSingleton<ITranscriptionQueue>(_ => new AzureStorageTranscriptionQueue(storageConnectionString));
}
else
{
    var mediaRoot = Path.Combine(builder.Environment.ContentRootPath, "_media");
    builder.Services.AddSingleton<IBlobStore>(_ => new LocalBlobStore(mediaRoot));
    builder.Services.AddSingleton<ITranscriptionQueue, NullTranscriptionQueue>();
}

var authority = builder.Configuration["Authentication:EntraExternalId:Authority"];
var audience = builder.Configuration["Authentication:EntraExternalId:Audience"];
if (string.IsNullOrWhiteSpace(authority) || string.IsNullOrWhiteSpace(audience))
{
    throw new InvalidOperationException("Authentication:EntraExternalId:Authority and Audience must be configured.");
}

var devBypassEnabled = builder.Environment.IsDevelopment()
    && builder.Configuration.GetValue<bool>("Authentication:DevBypass:Enabled");
const string CombinedAuthScheme = "wander-auth";
const string DevHeaderScheme = "DevHeader";

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = CombinedAuthScheme;
        options.DefaultChallengeScheme = CombinedAuthScheme;
    })
    .AddPolicyScheme(CombinedAuthScheme, CombinedAuthScheme, options =>
    {
        options.ForwardDefaultSelector = context =>
        {
            var hasBearer = context.Request.Headers.TryGetValue("Authorization", out var authHeaderValues)
                && authHeaderValues.Any(value => !string.IsNullOrWhiteSpace(value)
                    && value.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase));

            if (hasBearer)
            {
                return JwtBearerDefaults.AuthenticationScheme;
            }

            return devBypassEnabled ? DevHeaderScheme : JwtBearerDefaults.AuthenticationScheme;
        };
    })
    .AddJwtBearer(options =>
    {
        options.Authority = authority;
        options.Audience = audience;
    });

if (devBypassEnabled)
{
    builder.Services.AddAuthentication()
        .AddScheme<AuthenticationSchemeOptions, DevHeaderAuthenticationHandler>(DevHeaderScheme, _ => { });
}

builder.Services.AddAuthorization();

const string DevCors = "wander-dev";
builder.Services.AddCors(options =>
{
    options.AddPolicy(DevCors, policy =>
    {
        var configuredOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();
        var origins = configuredOrigins?.Length > 0
            ? configuredOrigins
            : [];

        if (builder.Environment.IsDevelopment())
        {
            var allowLocalhostAnyPort = builder.Configuration.GetValue<bool?>("Cors:AllowAnyLocalhostPort") ?? true;
            policy.AllowAnyHeader().AllowAnyMethod();

            if (allowLocalhostAnyPort)
            {
                policy.SetIsOriginAllowed(origin =>
                {
                    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
                        return false;
                    return uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
                           || uri.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase);
                });
            }
            else
            {
                var devOrigins = origins.Length > 0
                    ? origins
                    : ["http://localhost:8081", "http://localhost:19006", "http://localhost:3000"];
                policy.WithOrigins(devOrigins);
            }

            return;
        }

        if (origins.Length == 0)
        {
            throw new InvalidOperationException("Cors:AllowedOrigins must include at least one origin outside development.");
        }

        policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod();
    });
});

var app = builder.Build();

// Locally (and by default) the app applies migrations on startup for a zero-setup dev loop.
// In the cloud, migrations are applied by the deploy pipeline instead (so they run once,
// before code rolls out, rather than racing across multiple App Service instances).
// Cloud sets Database:MigrateOnStartup=false via app settings.
var migrateOnStartup = builder.Configuration.GetValue<bool?>("Database:MigrateOnStartup") ?? true;
if (migrateOnStartup)
{
    using var scope = app.Services.CreateScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<WanderDbContext>();
    dbContext.Database.Migrate();

    if (app.Environment.IsDevelopment())
    {
        DevDatabaseSeeder.Seed(dbContext, builder.Configuration);
    }
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors(DevCors);
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "wander-api" }));

app.Run();
