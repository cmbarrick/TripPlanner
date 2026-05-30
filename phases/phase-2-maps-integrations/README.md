# Phase 2 — Maps & Integrations

> Goal: Make planning **spatial and context-aware**.
> Est: ~3 weeks · Depends on: Phase 1

## Objectives
- Bring places, maps, weather, and calendar into the planning flow.
- Keep all third-party keys server-side via the **.NET API proxy** (Key Vault).

## Scope / tasks
- [ ] **Place search / autocomplete** (Mapbox or Google Places) via the **API proxy**.
- [ ] Selecting a place sets the item's structured location (name, address, lat/lng, place_id).
- [ ] **Map view:** all stops for a trip/day plotted; tap a pin → item detail.
- [ ] **Travel time/distance** between consecutive stops via a routing API
      (**Azure Maps Route** or Google Directions); driving/walking/transit estimate.
- [ ] **Directions / navigation hand-off:** a "Drive" / "Get directions" button **deep-links into
      Google Maps** (and **Apple Maps** on iOS) with origin/destination/waypoints in driving mode.
      No key required; we don't build in-app turn-by-turn.
- [ ] **Weather:** per-day forecast for the destination on the itinerary & calendar.
  - [ ] Provider-agnostic `IWeatherProvider` in the API; keys in Key Vault.
  - [ ] **Open-Meteo** first (no key, free, climate endpoint); **Azure Maps Weather** for prod.
  - [ ] **Date-based source:** ≤ ~16 days → live forecast; further out → climate normals
        (labeled "typical for this time of year").
  - [ ] Store Celsius; client renders °F/°C per the user's unit preference.
  - [ ] Cache forecast (~1–3h) and climate (long) responses.
  - [ ] **Granularity:** treat weather as **(location, date)** — fetch **per stop** (items have lat/lng);
        day header shows a **representative** summary derived from the day's primary location. This
        handles **multi-town days** (e.g. 9 towns in 10 days). Add **historical actuals per location**
        for past-trip recaps (used in Phases 5/7). See architecture §7 "Weather granularity".
- [ ] **Write to calendar (Apple + Google):**
  - [ ] **On-device create** via **`expo-calendar`** (with permission) — writes itinerary events into
        the device's calendars (which sync to the user's Google/iCloud accounts). Covers both on mobile.
  - [ ] **`.ics` export** as the universal fallback (and primary path on web).
  - [ ] *(Later / optional)* **Google Calendar API** (OAuth) for account-level **two-way sync** on web.
        Note: Apple has **no cloud write API** — iCloud sync is on-device only.
- [ ] **Caching layer:** cache Places & Weather responses to control cost/limits.
- [ ] Debounce autocomplete; graceful degradation when a provider is down.

## Out of scope
- AI suggestions (Phase 3), in-app booking (Phase 5).

## Testing plan
- [ ] **Unit:** distance/ETA formatting, `.ics` generation, deep-link URL builder, cache key logic.
- [ ] **Integration (MSW-mocked APIs):** autocomplete → select → item gets structured location;
      weather populates; **API proxy** hides keys; cache hit/miss behavior.
- [ ] **Calendar:** `expo-calendar` permission flow + event creation on iOS & Android; `.ics` validity.
- [ ] **Directions:** deep link opens Google Maps (and Apple Maps on iOS) with correct driving route.
- [ ] **E2E:** add a place by search → see pin on map → see travel time to next stop → tap "Drive"
      (Maps opens) → add itinerary to device calendar / export `.ics` and confirm it opens.
- [ ] **Non-functional:** verify no API keys in client bundle; autocomplete debounce; map perf
      with 30+ pins.
- [ ] **Regression:** Phases 0–1 suites green.

## Exit criteria
- Searching a place drops it on the map and into the itinerary with structured location data.
- Per-day weather and travel-time estimates render correctly.
- A "Drive" action opens **Google/Apple Maps** with driving directions for the route.
- Itinerary events can be **written to the device calendar** (Apple/Google) and exported as a valid `.ics`.
- No third-party keys present on the client.

## Artifacts
- Mockups: `../../mockups` (Map View, Place Search, Weather on itinerary)
