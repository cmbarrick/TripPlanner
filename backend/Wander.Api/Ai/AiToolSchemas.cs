namespace Wander.Api.Ai;

/// <summary>Tool schemas exposed to the chat model (Slice 3).</summary>
public static class AiToolSchemas
{
    public static IReadOnlyList<AiToolSchema> All { get; } =
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
            "Add a tentative stop to a day on the trip. Never set confirmation numbers or booking URLs.",
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
                "notes": { "type": "string" }
              },
              "required": ["dayNumber", "type", "title"],
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
