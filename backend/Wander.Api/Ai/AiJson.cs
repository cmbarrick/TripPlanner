using System.Text.Json;

namespace Wander.Api.Ai;

internal static class AiJson
{
    public static readonly JsonSerializerOptions CamelCase = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };
}
