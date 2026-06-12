namespace Wander.Api.Weather;

/// <summary>Human-readable labels for WMO weather interpretation codes (prompt/export text;
/// the app client maps the same codes to emoji).</summary>
public static class WmoCodes
{
    public static string Describe(int code) => code switch
    {
        0 => "clear sky",
        1 => "mostly clear",
        2 => "partly cloudy",
        3 => "overcast",
        45 or 48 => "fog",
        51 or 53 or 55 => "drizzle",
        56 or 57 => "freezing drizzle",
        61 or 63 or 65 => "rain",
        66 or 67 => "freezing rain",
        71 or 73 or 75 or 77 => "snow",
        80 or 81 or 82 => "rain showers",
        85 or 86 => "snow showers",
        95 => "thunderstorm",
        96 or 99 => "thunderstorm with hail",
        _ => "mixed conditions",
    };
}
