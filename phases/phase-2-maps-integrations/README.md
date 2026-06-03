# Phase 2 — Maps & Integrations

> Goal: Make planning **spatial and context-aware**.
> Est: ~3 weeks · Depends on: Phase 1

## Objectives
- Bring places, maps, weather, and calendar into the planning flow.
- Keep all third-party keys server-side via the **.NET API proxy** (Key Vault).

## Scope / tasks
- [x] **Place search / autocomplete** (Mapbox or Google Places) via the **API proxy**.
      _`IPlaceProvider` seam with `FakePlaceProvider` (CI/no-key) and `MapboxPlaceProvider` (key in config/Key Vault).
      `CachingPlaceProvider` decorator (autocomplete 5 min TTL, details 24 h TTL).
      `GET /api/places/autocomplete?q=…` and `GET /api/places/{id}` — authenticated, keys never in response.
      `PlaceSearchField` component: debounced 300 ms, loading/empty/error/"provider unavailable" states.
      Server auto-selects Fake provider when no `Places:MapboxAccessToken` config is present._
- [x] Selecting a place sets the item's structured location (name, address, lat/lng, place_id).
      _`ItineraryItem` gains `Address` + `PlaceId` columns (migration `AddPlaceIdAndAddressToItem`);
      both `EfCoreTripRepository` and `InMemoryTripRepository` `UpdateItem` paths persist them.
      `AddActivityScreen` auto-fills title, name, address, lat/lng, placeId on selection._
- [x] **Map view:** all stops for a trip/day plotted; tap a pin → item detail.
      _`WanderMapView` component: bounding-box-normalised schematic canvas with numbered pins,
      selected pin callout, legend list for the large (full-screen) view. No map tiles or keys
      required. Plugged into `List | Split | Map` and `Day | Trip` scope toggles in `TripPlannerScreen`._
- [x] **Travel time/distance** between consecutive stops.
      _`IRoutingProvider` seam: `HaversineRoutingProvider` (straight-line, no key, default) and
      `AzureMapsRoutingProvider` (real road network, activated by `Routing:AzureMapsKey` in config).
      `GET /api/trips/{id}/travel-times` returns per-leg walk/drive estimates. Client-side fallback
      via `estimate()` in `routing.ts` for instant display before the API responds._
- [x] **Directions / navigation hand-off:** "Directions ›" button between consecutive located stops.
      _`buildDirectionsUrl()` in `routing.ts`: Apple Maps (`maps://`) on iOS, Google Maps (`https://`)
      on Android + web. `buildRouteUrl()` for full multi-stop routes (up to 8 waypoints).
      No API key required — pure deep-link URL construction._
- [x] **Weather:** per-stop forecast on the itinerary; representative summary in day headers.
  - [x] Provider-agnostic `IWeatherProvider`; keys in Key Vault / user-secrets.
  - [x] **Open-Meteo** (no key, free); `FakeWeatherProvider` for CI. **Azure Maps Weather** for prod — swappable with no UI changes.
  - [x] **Date-based source:** ≤ 16 days → live forecast; further out → historical archive (same date −1 year), labeled "typical for this time of year".
  - [x] Store/fetch Celsius; client renders °F/°C per user preference via `formatTemp`.
  - [x] Cache: `CachingWeatherProvider` — 2 h forecast TTL, 24 h climate TTL, key = `(lat/lng ±1 km, date)`.
  - [x] **Granularity:** per-stop weather (items with lat/lng); day header = first located item; unlocated items show no badge. Multi-town days get per-stop conditions. See architecture §7.
  - [ ] **Hourly weather** *(deferred to Phase 4/6)*: Open-Meteo supports `hourly=temperature_2m,weather_code,precipitation_probability`
        on the same endpoint (24 values/day for the ≤16-day window). Daily high/low is right for
        planning; hourly is useful during the trip ("will it rain at 2 PM?") and for recaps.
        Implementation: add `GetHourlyAsync` to `IWeatherProvider`; cache full day array under one key;
        surface in the item detail screen (Phase 4) and recap timeline (Phase 6).
        See architecture §7 "Hourly weather".
- [x] **Write to calendar (Apple + Google):**
  - [x] **On-device create** via **`expo-calendar`** (with permission) — `addTripToCalendar()` in
        `app/src/calendar.ts`; finds/creates a "Wander" calendar; writes confirmed + tentative items
        as timed or all-day events; 1 h alarm on timed items. Works on iOS (Apple Calendar) and
        Android (Google Calendar). Web shows "use .ics" prompt.
  - [x] **`.ics` export** — `generateIcs()` + `exportIcs()` in `app/src/ics.ts`. RFC 5545 compliant
        (line folding, escaped chars, DATE vs DATETIME). Web: browser download via Blob URL.
        Native: `expo-file-system` write + `expo-sharing` OS share sheet.
  - [ ] *(Later / optional)* **Google Calendar API** (OAuth) for account-level **two-way sync** on web.
        Apple has no cloud write API — iCloud sync is on-device only.
- [x] **Caching layer:** cache Places & Weather responses to control cost/limits.
      _`IMemoryCache` now; upgrade path to Azure Cache for Redis documented in architecture §6 and
      Phase 3 README for when multi-instance App Service is deployed._
- [x] Debounce autocomplete; graceful degradation when a provider is down.
      _Place search: 300 ms debounce, per-provider 503 → "Location search unavailable" fallback.
      Weather: `FetchSafe` swallows provider errors per-stop, partial results returned.
      Travel times: `FetchSafe` swallows errors per-segment._

## Out of scope
- AI suggestions (Phase 5), in-app booking (Later / v2).

## Testing plan
- [ ] **Unit:** distance/ETA formatting, `.ics` generation, deep-link URL builder, cache key logic.
- [x] **Integration (MSW-mocked APIs):** autocomplete → select → item gets structured location;
      **API proxy** hides keys; cache hit/miss behavior.
      _Backend: `PlacesControllerTests` (11 tests) — autocomplete happy path, empty query 400,
      limit clamping, provider 503 → 503, no token/key in response, cache same-query called once,
      details found/not-found/503. Frontend: `places.test.ts` (8 tests) — blank query short-circuits,
      API success, network throw → empty array, 503 → empty array, URL contains query._
- [ ] **Calendar:** `expo-calendar` permission flow + event creation on iOS & Android; `.ics` validity.
- [ ] **Directions:** deep link opens Google Maps (and Apple Maps on iOS) with correct driving route.
- [ ] **E2E:** add a place by search → see pin on map → see travel time to next stop → tap "Drive"
      (Maps opens) → add itinerary to device calendar / export `.ics` and confirm it opens.
- [ ] **Non-functional:** verify no API keys in client bundle; autocomplete debounce; map perf
      with 30+ pins.
- [x] **Regression:** Phases 0–1 suites green.
      _`dotnet test`: 32 passing (21 existing + 11 new). `jest`: 28 passing (21 existing + 7 new,
      all 4 suites green — also fixed pre-existing App.test.tsx gesture/worklets mock gap).
      `tsc --noEmit`: clean. Playwright smoke: unchanged (still passes on web build)._

## Exit criteria
- Searching a place drops it on the map and into the itinerary with structured location data.
- Per-day weather and travel-time estimates render correctly.
- A "Drive" action opens **Google/Apple Maps** with driving directions for the route.
- Itinerary events can be **written to the device calendar** (Apple/Google) and exported as a valid `.ics`.
- No third-party keys present on the client.

## Artifacts
- Mockups: `../../mockups` (Map View, Place Search, Weather on itinerary)

---

## Local-dev key setup (place search)

The backend **auto-detects** which provider to use:
- **No key configured** → `FakePlaceProvider` (hardcoded European landmarks). The full UI flow
  (search → autocomplete dropdown → select → pin on map) works without any key.
- **Key configured** → `MapboxPlaceProvider` calls the real Mapbox Geocoding API v6.

### Using the real Mapbox provider locally

1. Create a **Mapbox access token** at <https://account.mapbox.com/access-tokens/>.
   Give it the `GEOCODING` public scope.
2. Add the token to your local user-secrets (**never commit it**):
   ```
   cd backend/Wander.Api
   dotnet user-secrets set "Places:MapboxAccessToken" "pk.eyJ1…"
   ```
3. Restart the API. The startup log will confirm `MapboxPlaceProvider` is active.

**Production:** add `Places:MapboxAccessToken` to Azure Key Vault.
The API reads it via `IConfiguration` with no code changes.

### CI / automated tests

No key is required. The test project instantiates `FakePlaceProvider` directly; the
`PlacesControllerTests` never contact any network.

---

## Progress log

- **2026-05-31 (slice 3 — travel time + directions + calendar export):** Completed all remaining
  Phase 2 scope.
  - **Travel time:** `IRoutingProvider` seam — `HaversineRoutingProvider` (straight-line, no key,
    default) and `AzureMapsRoutingProvider` (real road times, key in `Routing:AzureMapsKey`).
    `GET /api/trips/{id}/travel-times` returns per-leg estimates for consecutive timed+located stops.
    Client-side `routing.ts`: `estimate()` for instant fallback, `buildDirectionsUrl()` (Apple Maps
    on iOS / Google Maps elsewhere), `buildRouteUrl()` (multi-stop, up to 8 waypoints). `TravelRow`
    component renders between consecutive timed items with walk/drive estimates and a Directions button.
  - **.ics export:** `generateIcs()` (RFC 5545, line folding, DATE/DATETIME, GEO field) +
    `exportIcs()` — web Blob download, native `expo-file-system` + `expo-sharing` OS share sheet.
  - **expo-calendar:** `addTripToCalendar()` — permission request, find/create "Wander" calendar,
    write confirmed + tentative items as timed or all-day events with 1 h alarm. iOS: Apple
    Calendar; Android: Google Calendar; web: shows prompt to use .ics instead.
  - **Export panel:** "↑ Export" toggle in the planner meta row opens `ExportPanel` with
    "Export .ics" (all platforms) and "Add to Calendar" (native only) buttons.
  - **Backend:** `dotnet test` = **49 passing** (41 + 8 new `TravelTimesControllerTests`).
    `tsc` clean. `jest` = **28 passing** (4 suites).
  - **Remaining:** Google Calendar API two-way sync (optional, later); Redis cache upgrade (Phase 3);
    real-device calendar permission + .ics validity manual verification.

- **2026-05-30 (slice 1 — place search + structured location + map view):** Completed the first
  Phase 2 vertical slice (foundation for travel-time, weather-per-stop, and directions).
  - **Backend:** `IPlaceProvider` seam + `FakePlaceProvider` (CI/no-key) + `MapboxPlaceProvider`
    (reads `Places:MapboxAccessToken` from config/Key Vault, auto-selected) + `CachingPlaceProvider`
    decorator (`IMemoryCache`; 5 min autocomplete TTL, 24 h details TTL). New `PlacesController`
    with `GET /api/places/autocomplete?q=…` and `GET /api/places/{id}` — authenticated, DTO-projected
    so no provider credentials appear in responses. `ItineraryItem` gains `Address` + `PlaceId`
    columns; EF migration `AddPlaceIdAndAddressToItem`. Both `EfCoreTripRepository` and
    `InMemoryTripRepository.UpdateItem` persist the new fields. `dotnet test`: **32 passing**
    (21 existing + 11 new `PlacesControllerTests`).
  - **Frontend:** `PlaceSearchField` component — debounced 300 ms, loading/empty/error/provider-
    unavailable states, clear button. Replaces the raw TextInput in `AddActivityScreen`; selecting
    a result fills `locationName`, `address`, `placeId`, `latitude`, `longitude` (auto-fills title
    if blank). `ItineraryItemInput` updated to carry the new fields; `searchPlaces` and
    `getPlaceDetails` API functions degrade to empty/null on error (no user-visible crash).
    `WanderMapView` component — bounding-box-normalised schematic canvas with numbered pins,
    selected-pin callout, tap-to-open item, and a legend list in large mode; no map tiles or
    keys required. Replaces `MapPlaceholder` in `TripPlannerScreen` for both `Split` and `Map`
    views. Also fixed pre-existing App.test.tsx worklets/gesture-handler mock gap. `tsc`: clean.
    `jest`: **28 passing** (21 existing + 7 new `places.test.ts`), all 4 suites green.
  - **What remains in this slice's scope:** E2E smoke covering the search→pin-on-map path;
    manual verify on real device that the debounce and provider-unavailable fallback feel correct;
    verify the web bundle (`expo export --platform web`) contains no `MapboxAccessToken`.
  - **Next Phase 2 slice:** weather per-stop (Open-Meteo `IWeatherProvider` + `GET /api/trips/{id}/weather`).
