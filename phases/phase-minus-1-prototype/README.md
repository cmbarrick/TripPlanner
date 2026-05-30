# Phase −1 — Prototype (already built)

> Status: **Done (prototype on fake data)** · Last updated: 2026-05-30
> Purpose: record what already exists so Phase 0/1 build *on top of* it instead of re-doing it.

This is the throwaway-friendly proof-of-concept we built to validate the UX and data shape. It runs
the **full app on a laptop with zero infrastructure**: an in-memory .NET API + an Expo client that
falls back to bundled mock data. **No database, no auth, no cloud.**

---

## What works today
- **Backend (ASP.NET Core .NET 9):** REST API serving **in-memory seeded** trips (Lisbon, Kyoto,
  Swiss Alps) with nested days + itinerary items; `/health` endpoint; permissive dev CORS.
- **Client (Expo — RN + Web):** runs in a phone frame on web (and native).
  - **My Trips** list (with live/offline-data indicator).
  - **Trip detail / itinerary** — timeline with weather + costs.
  - **Add Activity** — form with day picker (updates in-session state).
  - **Calendar** — **day** and **multi-day** time-grid views with conflict highlighting.
  - **Profile** — temperature unit toggle (°F/°C), defaulting to °F.
  - Tab navigation; Assistant tab is a placeholder.
- **Shared logic:** conflict detection, time sorting, °C→°F formatting, local-id generation.

## File map
```
backend/Wander.Api/
  Program.cs                         # DI, dev CORS, /health, OpenAPI; registers in-memory repo
  Controllers/TripsController.cs     # GET/POST/PUT/DELETE trips + add/delete items (owner = "demo-user")
  Data/ITripRepository.cs            # repo interface (the seam for EF Core later)
  Data/InMemoryTripRepository.cs     # ConcurrentDictionary-backed implementation
  Data/SeedData.cs                   # 3 realistic trips, weather stored in Celsius
  Models/{Trip,Day,ItineraryItem}.cs # core domain models
  Wander.Api.csproj                  # net9.0, OpenAPI only (no EF Core yet)

app/
  App.tsx                            # state + simple view/tab navigation; lifts trips + unit pref
  src/api.ts                         # fetches API, falls back to mockData if API is down
  src/mockData.ts                    # client mirror of SeedData
  src/types.ts                       # TS interfaces mirroring backend models
  src/theme.ts  src/components.tsx   # design tokens + Pill/Card/TripCover/TabBar
  src/format.ts src/itinerary.ts     # date/time/temp formatting + conflict detection
  src/screens/                       # MyTrips, TripDetail, AddActivity, Calendar, Profile, Placeholder
```

## Deliberate shortcuts (NOT production)
- **No persistence** — API data is in-memory; restarting the API resets it. The client's "Add
  Activity" only updates **in-session React state** (no write-back to the API yet).
- **No auth** — controller hardcodes `owner = "demo-user"`; no identity/JWT.
- **No real integrations** — weather/places are seeded fake data; no maps, no AI.
- **Unit preference not persisted** — lives in app state only.
- **CORS is wide open** (`AllowAnyOrigin`) for dev convenience.
- **No tests, no CI, no cloud deploy.**

## What carries forward vs. gets replaced
| Keep / evolve | Replace in Phase 0/1 |
|---|---|
| Domain models, TS types, screens, components | `InMemoryTripRepository` → **EF Core + Postgres** |
| `ITripRepository` seam (swap implementation) | `DemoOwner` constant → **real authenticated user** |
| Conflict/format/itinerary logic | In-session edits → **real API writes + sync** |
| UX patterns validated here | Wide-open CORS → **locked-down origins** |

## How to run
See the root [`README.md`](../../README.md) → "Run it locally" (API on `:5064`, Expo web on `:8081`).
