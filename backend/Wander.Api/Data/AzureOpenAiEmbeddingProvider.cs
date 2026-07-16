using Azure.AI.OpenAI;
using Microsoft.Extensions.Options;
using Wander.Api.Ai;

namespace Wander.Api.Data;

/// <summary>Azure OpenAI implementation of <see cref="IEmbeddingProvider"/>, selected when
/// <c>Ai:Endpoint</c>/<c>Ai:ApiKey</c> are configured (same Azure OpenAI resource as chat/recap
/// generation, just a different deployment).</summary>
public sealed class AzureOpenAiEmbeddingProvider(AzureOpenAIClient client, IOptions<AiOptions> options)
    : IEmbeddingProvider
{
    private readonly AiOptions _options = options.Value;

    public async Task<float[]> EmbedAsync(string text, CancellationToken ct = default)
    {
        var embeddingClient = client.GetEmbeddingClient(_options.EmbeddingDeployment);
        var result = await embeddingClient.GenerateEmbeddingAsync(text, cancellationToken: ct);
        return result.Value.ToFloats().ToArray();
    }
}
