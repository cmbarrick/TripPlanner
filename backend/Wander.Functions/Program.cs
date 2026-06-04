using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Wander.Functions.Transcription;

// .NET isolated worker host for Wander's background jobs. Today: voice-note transcription
// (queue-triggered). Future Phase 6/8 jobs (recap generation, embeddings, moderation) can be
// added as additional functions in this same worker.
var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices(services =>
    {
        services.AddHttpClient();
        services.AddSingleton<ITranscriptionService, AzureSpeechTranscriptionService>();
    })
    .Build();

host.Run();
