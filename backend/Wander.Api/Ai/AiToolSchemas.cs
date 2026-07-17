namespace Wander.Api.Ai;

/// <summary>Tool schemas exposed to the chat model (Slice 3).</summary>
public static class AiToolSchemas
{
    /// <summary>The tools offered to the model this turn. <paramref name="activitiesEnabled"/> is a
    /// deliberate kill switch (<c>Activities:Enabled</c> in config) — <c>searchActivities</c> stays
    /// out of the model's tool list entirely until it's flipped on, e.g. while a newly-issued
    /// provider API key is still going through its own activation delay. This is independent of
    /// which <c>IActivityProvider</c> is registered (real vs. fake): the tool can be wired and
    /// tested end-to-end without ever being reachable from a live chat.</summary>
    public static IReadOnlyList<AiToolSchema> All(bool activitiesEnabled = true) =>
        activitiesEnabled ? AllTools : AllTools.Where(t => t.Name != "searchActivities").ToList();

    private static readonly IReadOnlyList<AiToolSchema> AllTools =
    [
        new(
            "searchPlaces",
            "Search for places near the trip destination. Returns candidates with placeId, name, and coordinates.",
            """
            {
              "type": "object",
              "properties": {
                "query": { "type": "string", "description": "Place name or category to search for" },
                "limit": { "type": "integer", "description": "Max results (1-8)", "default": 5 }
              },
              "required": ["query"],
              "additionalProperties": false
            }
            """),
        new(
            "getWeather",
            "Get weather for a trip day (by dayNumber) or a specific itinerary item (by itemId).",
            """
            {
              "type": "object",
              "properties": {
                "dayNumber": { "type": "integer", "description": "1-based day number on the trip" },
                "itemId": { "type": "string", "description": "Itinerary item UUID" }
              },
              "additionalProperties": false
            }
            """),
        new(
            "addItineraryItem",
            "Add a tentative stop to a day on the trip. Never set confirmation numbers. Never write a " +
            "bookingUrl, price, or rating yourself — there is no such field here. If this stop is a " +
            "bookable activity found via searchActivities, pass its activityId and the server attaches " +
            "the real booking link and price; if you didn't search first, omit activityId entirely " +
            "rather than guessing one.",
            """
            {
              "type": "object",
              "properties": {
                "dayNumber": { "type": "integer" },
                "type": { "type": "string", "enum": ["Flight", "Lodging", "Food", "Activity", "Transport"] },
                "title": { "type": "string" },
                "startTime": { "type": "string", "description": "Local HH:mm" },
                "endTime": { "type": "string", "description": "Local HH:mm" },
                "locationName": { "type": "string" },
                "address": { "type": "string" },
                "placeId": { "type": "string" },
                "cost": { "type": "number" },
                "notes": { "type": "string" },
                "activityId": {
                  "type": "string",
                  "description": "activityId from a prior searchActivities result, if this stop is that bookable activity. Omit if not applicable — never invent one."
                }
              },
              "required": ["dayNumber", "type", "title"],
              "additionalProperties": false
            }
            """),
        new(
            "searchActivities",
            "Search real, currently-bookable tours/activities near a day's stops. Returns actual " +
            "options with real prices and booking links — never present an activity to the traveler " +
            "unless it came from this tool.",
            """
            {
              "type": "object",
              "properties": {
                "dayNumber": { "type": "integer", "description": "Day to find activities near (uses that day's located stops, or the trip destination)" },
                "query": { "type": "string", "description": "Optional keyword filter, e.g. 'walking tour' or 'cooking class'" },
                "limit": { "type": "integer", "description": "Max results (1-10)", "default": 5 }
              },
              "required": ["dayNumber"],
              "additionalProperties": false
            }
            """),
        new(
            "moveItem",
            "Move an itinerary item to another day or to the trip backlog (targetDayNumber null).",
            """
            {
              "type": "object",
              "properties": {
                "itemId": { "type": "string" },
                "targetDayNumber": { "type": ["integer", "null"], "description": "Null moves to backlog" }
              },
              "required": ["itemId", "targetDayNumber"],
              "additionalProperties": false
            }
            """),
        new(
            "removeItem",
            "Remove an itinerary item from the trip.",
            """
            {
              "type": "object",
              "properties": {
                "itemId": { "type": "string" }
              },
              "required": ["itemId"],
              "additionalProperties": false
            }
            """),
        new(
            "suggestGapFill",
            "Find empty time gaps on a day that could fit more activities. Does not modify the trip.",
            """
            {
              "type": "object",
              "properties": {
                "dayNumber": { "type": "integer" },
                "minimumMinutes": { "type": "integer", "description": "Minimum gap length", "default": 90 }
              },
              "required": ["dayNumber"],
              "additionalProperties": false
            }
            """),
    ];
}
