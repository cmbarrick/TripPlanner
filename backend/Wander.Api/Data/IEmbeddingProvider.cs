using System.Text.RegularExpressions;

namespace Wander.Api.Data;

/// <summary>
/// Text embeddings for semantic search over public recaps (Phase 8, Slice 2). Same swappable-seam
/// convention as <see cref="IWeatherProvider"/>/<see cref="IPlaceProvider"/>/moderation: a real
/// Azure OpenAI implementation when configured, a deterministic fake otherwise.
/// </summary>
public interface IEmbeddingProvider
{
    Task<float[]> EmbedAsync(string text, CancellationToken ct = default);
}

/// <summary>
/// Deterministic bag-of-words hashing embedding used until Azure OpenAI embeddings are configured
/// (dev/CI default). Each token hashes into a fixed-size bucket, so texts sharing vocabulary land
/// closer together under cosine similarity — real enough to exercise ranking logic in tests without
/// a model call, the same spirit as <c>FakeAiProvider</c>/<c>FakeContentModerationService</c>.
/// </summary>
public class FakeEmbeddingProvider : IEmbeddingProvider
{
    public const int Dimensions = 64;

    private static readonly Regex TokenPattern = new(@"[a-z0-9]+", RegexOptions.Compiled);

    public Task<float[]> EmbedAsync(string text, CancellationToken ct = default)
    {
        var vector = new float[Dimensions];
        if (!string.IsNullOrWhiteSpace(text))
        {
            foreach (Match token in TokenPattern.Matches(text.ToLowerInvariant()))
            {
                var bucket = Math.Abs(token.Value.GetHashCode()) % Dimensions;
                vector[bucket] += 1f;
            }
        }

        var norm = MathF.Sqrt(vector.Sum(x => x * x));
        if (norm > 0)
            for (var i = 0; i < vector.Length; i++)
                vector[i] /= norm;

        return Task.FromResult(vector);
    }
}
