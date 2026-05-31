# Phase 2 Summary — Maps & Integrations

Date: 2026-05-31  
Status: Complete. All exit criteria met. Two items explicitly deferred to later phases.

---

## Outcome

Phase 2 made Wander **spatial and context-aware**. A user can now search for a place by name,
have it pinned on a map with structured coordinates, see live weather at each stop, get
walk/drive estimates between consecutive items, deep-link into Google or Apple Maps for
directions, track flights on FlightAware, and export the whole trip to their calendar.

All third-party API keys remain server-side. The app degrades gracefully when any provider
is unavailable.

---

## What Was Completed

### Slice 1 — Place search + structured location + Map view

**Backend**
- `IPlaceProvider` seam: `FakePlaceProvider` (CI / no key) and `MapboxPlaceProvider`
  (reads `Places:MapboxAccessToken` from config / Key Vault). Auto-selects fake when no
  token is present.
- `CachingPlaceProvider` decorator: 5 min autocomplete TTL, 24 h details TTL.
  Cache key never includes provider credentials.
- `GET /api/places/autocomplete?q=…` and `GET /api/places/{id}` — authenticated, DTO-projected
  so no provider secrets appear in responses. Returns 503 (not 500) on provider failure.
- `ItineraryItem` gains `Address` and `PlaceId` columns; EF migration `AddPlaceIdAndAddressToItem`.
  Both `EfCoreTripRepository` and `InMemoryTripRepository` persist them on `UpdateItem`.
- `PlacesControllerTests`: 11 tests — autocomplete, empty query 400, limit clamping,
  provider 503 pass-through, no-key-in-response assertion, cache same-query called once,
  details found / not found / 503.
- `FakeAuth` test helper (reusable by all future controller unit tests).

**Frontend**
- `PlaceSearchField` component — 300 ms debounce, loading / empty / error /
  "provider unavailable" states, ✕ clear button.
- `AddActivityScreen` Place field upgraded to `PlaceSearchField`. Selecting a result fills
  `locationName`, `address`, `placeId`, `latitude`, `longitude`. Auto-fills `title` if blank.
  Typing manually after a selection clears the structured fields.
- `searchPlaces` and `getPlaceDetails` in `api.ts` degrade to empty / null on any error.
- `WanderMapView` — schematic bounding-box canvas on native; **Leaflet + OpenStreetMap tiles**
  in a sandboxed iframe on web (`.web.tsx` platform split; free, no key). Cluster pins group
  same-location stops with a count badge and golden-angle spiral offset. Tap a pin → callout
  + `onItemPress`. Legend list in large (Map) view.
- Replaces `MapPlaceholder` in `TripPlannerScreen` for both Split and Map views. AI dock
  hidden in Map view (it's irrelevant there).
- `places.test.ts`: 7 tests — blank query short-circuit, API success, network error → empty,
  503 → empty, URL contains query string.
- Fixed pre-existing `App.test.tsx` gesture-handler / worklets mock gap (was already failing
  before Phase 2; 28 → 28 tests, now all 4 suites pass cleanly).

---

### Slice 2 — Weather per-stop + day headers

**Backend**
- `IWeatherProvider` seam: `FakeWeatherProvider` (deterministic, no network; used when
  `Weather:UseFake=true` or in CI) and `OpenMeteoWeatherProvider` (free, no key).
  - ≤ 16 days out → `api.open-meteo.com/v1/forecast`
  - Further out → `archive-api.open-meteo.com/v1/archive` (same calendar date, −1 year),
    marked `isClimateSummary: true` → "typical for this time of year" label in UI.
- `CachingWeatherProvider` decorator: cache key = `(lat/lng rounded to 2 dp, date)`.
  Forecast TTL 2 h; climate/archive TTL 24 h.
- `GET /api/trips/{id}/weather` — ownership-checked. Returns per-item and per-day weather
  in Celsius. Provider failures per-stop are swallowed; partial results returned.
  No provider credentials in response.
- `WeatherControllerTests`: 9 tests — happy path, no-located-items empty, not-found 404,
  no-key-in-response, highC ≥ lowC, FakeProvider near/far date dispatch, cache same-location
  called once, cache different dates called twice.

**Frontend**
- `wmoEmoji(code)` in `format.ts` — WMO weather interpretation codes → emoji.
- `fmtMinutes(minutes)` in `format.ts` — "5 min", "1 h 10 min".
- `useWeatherQuery(tripId)` — TanStack Query, 1 h stale time.
- Day headers: live weather badge (emoji + high temp + "typical" pill for climate summaries).
  Live API data takes precedence over the seeded `weatherHighC` field.
- Item rows: per-item weather badge (emoji + high, `~` suffix for climate estimates) on
  located stops. Unlocated items show no badge.

---

### Slice 3 — Travel time + directions + calendar export

**Backend**
- `IRoutingProvider` seam: `HaversineRoutingProvider` (straight-line Haversine, no key,
  default) and `AzureMapsRoutingProvider` (real road-network times via Azure Maps Route API,
  activated by `Routing:AzureMapsKey`). Azure Maps provider falls back to Haversine on
  network failure.
- `GET /api/trips/{id}/travel-times` — ownership-checked. Returns per-leg walk/drive estimates
  for consecutive timed + located items within each day.
- `TravelTimesControllerTests`: 8 tests — Haversine known distance, same-point clamp,
  walk ≥ drive always, consecutive located timed items returns segment, no coords skips,
  no times skips, unknown trip 404, three items returns two segments.

**Frontend**
- `routing.ts`: `haversineKm`, `estimate()`, `buildDirectionsUrl()` (Apple Maps on iOS /
  Google Maps on Android + web), `buildRouteUrl()` (multi-stop, up to 8 waypoints),
  `flightAwareUrl()`, `flightRadar24Url()`.
- `TravelRow` — renders between every consecutive pair of timed items in a day:
  - Normal ground leg (both sides have coordinates): 🚶 walk · 🚗 drive · distance, "Directions ›".
  - Flight leg (fromItem is a Flight with a flight number): "✈ BA123 · Track ›" (FlightAware).
  - Either side missing coordinates: renders nothing.
  - Uses server segment when available; falls back to client-side Haversine instantly.
- `.ics` export (`ics.ts`): RFC 5545 compliant (line folding, escaped chars, `DATE` vs
  `DATETIME`, `GEO` field, all-day fallback). Web: Blob download. Native: `expo-file-system`
  write + `expo-sharing` OS share sheet.
- Calendar sync (`calendar.ts`): `expo-calendar` — permission request, find/create "Wander"
  calendar, write confirmed + tentative items as timed or all-day events with 1 h alarm.
  iOS → Apple Calendar, Android → Google Calendar, Web → "use .ics" prompt.
- "↑ Export" panel in `TripPlannerScreen` meta row — "Export .ics" (all platforms) and
  "Add to Calendar" (native only).
- `useTravelTimesQuery(tripId)` — TanStack Query, 10 min stale time.

---

### Slice 4 — Flight number + tracking links

**Backend**
- `FlightNumber` column on `ItineraryItem` (nullable, only meaningful for `type = Flight`).
  EF migration `AddFlightNumber`. Both repos persist on `UpdateItem`.

**Frontend**
- `flightNumber` in `ItineraryItem` type and `ItineraryItemInput`.
- `AddActivityScreen` when type = Flight:
  - New "Flight number" field (auto-uppercases, e.g. `BA 123`).
  - "Confirmation #" relabels to "Booking ref".
  - "Booking / confirmation link" relabels to "Airline booking link".
  - `flightNumber` is nulled when switching away from Flight type.
- `ItemRow` for Flight items with a flight number: "✈ FlightAware · 📡 FR24" tracking links
  replace the generic booking link.
- `airlineCodes.ts`: IATA→ICAO lookup table (~100 airlines), `parseFlightNumber()`,
  `toIcaoFlightNumber()`. FlightAware URLs use ICAO (converted automatically); FR24 uses
  IATA directly (it accepts both).
- `airlineCodes.test.ts`: 20 tests — parse formats, conversion, pass-through of ICAO and
  unknown codes, URL builders, table sanity (all IATA keys 2 chars, all ICAO values 3 chars).

---

## Test counts at phase close

| Suite | Count | Notes |
|---|---|---|
| `dotnet test` | **49 passing** | 21 Phase 1 + 11 places + 9 weather + 8 travel times |
| `jest` | **48 passing** | 21 Phase 1 + 7 places + 20 airline codes (5 suites) |
| `tsc --noEmit` | ✅ clean | |
| Playwright smoke | ✅ passes | Web shell unchanged |

---

## EF Core migrations added

| Migration | Adds |
|---|---|
| `AddPlaceIdAndAddressToItem` | `Address`, `PlaceId` on `ItineraryItems` |
| `AddFlightNumber` | `FlightNumber` on `ItineraryItems` |

---

## New npm packages

| Package | Purpose |
|---|---|
| `expo-file-system` | Write `.ics` to device cache directory (native) |
| `expo-sharing` | OS share sheet for `.ics` export (native) |
| `expo-calendar` | On-device Apple/Google calendar sync (native) |

---

## Local dev key setup (quick reference)

| Feature | Key / config | Default (no key) |
|---|---|---|
| Place autocomplete | `Places:MapboxAccessToken` in user-secrets | `FakePlaceProvider` (8 European landmarks) |
| Weather | Always free — Open-Meteo, no key | Live forecast / archive |
| Travel time | `Routing:AzureMapsKey` in user-secrets | Haversine straight-line estimates |
| Map tiles (web) | None — OpenStreetMap via Leaflet CDN | Always works |
| Map tiles (native) | None — schematic canvas | Always works |

---

## Deferred items (documented, not blocked)

| Item | Deferred to | Notes |
|---|---|---|
| Hourly weather | Phase 5/6 | `GetHourlyAsync` extension point on `IWeatherProvider`; same Open-Meteo endpoint |
| Google Calendar two-way sync | Later / optional | `.ics` + `expo-calendar` cover the use case |
| Redis cache | Phase 3 | Upgrade path documented in architecture §6 and Phase 3 README |
| Real map tiles on native | Future Phase 2 slice | `react-native-maps` or Mapbox; web already has Leaflet/OSM |
| Azure Maps routing | When key is available | `AzureMapsRoutingProvider` already implemented, activated by config key |

---

## What's next

**Phase 3 — Deployment & Release Foundations:** Azure resource groups, App Service deploy,
PostgreSQL environments, CI/CD pipeline, EAS Build/Update, Redis cache upgrade, Key Vault
wiring for all Phase 2 provider keys.

**Phase 4 — AI Planning Assistant:** generate/refine itineraries via chat, tool-calling
(search places, add/move items, gap-fill), preference-aware, per-user quotas.
