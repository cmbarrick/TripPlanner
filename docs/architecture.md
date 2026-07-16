# Architecture Decision Record — Wander (Trip Planning App)

> Status: **Accepted** · Owner: Engineering · Last updated: 2026-05-29
> Stack: **Expo (RN + Web)** client · **ASP.NET Core + EF Core** API · **PostgreSQL** · hosted on **Azure**

This document captures the chosen architecture, the reasoning behind each decision,
and the trade-offs we accepted. It is the single source of truth for technical direction.

---

## 1. Product constraints driving the architecture

| Constraint | Implication |
|---|---|
| **iOS + Android + Web from one codebase** | Use a cross-platform framework (React Native + Web) |
| **Plan → Experience → Reflect → Share → Discover** | App spans planning, capture, recap, social, and discovery |
| **Low-friction capture, incl. voice, while traveling** | Offline-first notes + audio; server-side transcription |
| **Share with friends (link + accounts) + real-time co-edit** | Identity early; realtime channel; roles & multi-user merge |
| **Publish public recaps + AI discovery** | UGC moderation, search/vector index, RAG over consented content |
| **AI as a helpful assistant** | Server-side AI orchestration; keys never on device |
| **Privacy & consent first-class** | Granular, revocable consent for share/publish/AI; PII handling |
| **Offline access while traveling** | Local-first data layer with background sync (incl. media) |

---

## 2. High-level architecture (Azure-hosted)

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENT (Expo)                          │
│  iOS · Android · Web (RN Web)                                 │
│  UI (Expo Router) → State (Zustand + TanStack Query)          │
│  Local DB (SQLite) + local media cache ⇄ Sync (offline-first) │
│  Audio recording · realtime co-edit client                    │
└───────────────┬───────────────────────────┬───────────────────┘
                │ HTTPS (REST/JSON)          │ WebSocket (presence/co-edit)
                ▼                            ▼
┌──────────────────────────────────────────────────────────────┐
│            ASP.NET Core Web API  (Azure App Service)          │
│  Controllers → Services → EF Core (Npgsql)                    │
│  AuthN/Z: Microsoft Entra External ID (JWT) · roles & sharing │
│  Orchestrates: planning AI · recap AI · RAG · transcription   │
│  Proxies provider keys (Key Vault) · enforces consent gates   │
└──┬────────┬──────────┬───────────┬───────────┬───────────┬────┘
   ▼        ▼          ▼           ▼           ▼           ▼
┌────────┐┌────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐
│ Azure  ││ Azure  ││ Azure    ││ Azure    ││ Vector   ││ Azure AI │
│ Postgres││ Blob   ││ OpenAI   ││ Speech   ││ index    ││ Content  │
│(Flex)  ││(media) ││(LLM/embed)││(STT)    ││(AI Search││ Safety   │
│        ││audio/  ││recap+RAG ││voice→txt ││/pgvector)││moderation│
│        ││photos  ││          ││          ││ discovery││          │
└────────┘└────────┘└──────────┘└──────────┘└──────────┘└──────────┘
  Realtime: Azure Web PubSub / SignalR   ·   Jobs: Azure Functions
  (transcription, embeddings, recap generation, moderation run async)
```

> **Local dev (current):** the API serves **in-memory seeded fake data** (no database required)
> so the full app runs on a laptop immediately. We swap the EF Core provider to a local
> PostgreSQL connection, then to Azure Database for PostgreSQL, with no API/UI changes.

---

## 3. Technology choices

### Client — **Expo (React Native + React Native Web)**
- **Why:** One TypeScript codebase ships to iOS, Android, and web. Largest cross-platform
  ecosystem, OTA updates, great DX.
- **Routing:** Expo Router (file-based, works across native + web).
- **UI:** Tamagui (or NativeWind) for a shared, themeable design system across native/web.
- **Server state:** TanStack Query (caching, retries, optimistic updates).
- **Client state:** Zustand (lightweight UI/global state).
- **Forms/validation:** React Hook Form + Zod.
- **Alternatives considered:** Flutter (different language, smaller JS/AI tooling overlap),
  separate native + Next.js web apps (2x the work — rejected for a solo-first product).

### Local-first data — **SQLite (expo-sqlite) + a sync layer**
- **Why:** Offline read/write is a hard requirement for travelers. We treat the local DB as
  the source of truth for the UI and sync to the API in the background.
- **Approach:** Start with TanStack Query persistence + an outbox table for queued mutations.
  Graduate to **WatermelonDB** or **PowerSync** if conflict handling gets complex.
- **Conflict strategy (v1):** last-write-wins per record, with `updated_at` timestamps.
  Revisit with CRDTs only if real-time collaboration (v2) demands it.

### Backend API — **ASP.NET Core (.NET 9) + EF Core**
- **Why:** Plays directly to our Azure/.NET strength, has first-class Azure tooling and
  deployment, and EF Core gives a clean Postgres data layer with migrations.
- **Shape:** REST/JSON, layered as Controllers → Services → EF Core `DbContext`.
- **ORM/provider:** EF Core with **Npgsql** (PostgreSQL). The same code runs against local
  in-memory data, local Postgres, and Azure Database for PostgreSQL.
- **Docs:** Swagger / OpenAPI in development.
- **Alternatives considered:** Node + NestJS (would share types with the client, but .NET wins
  on Azure familiarity); Firebase/Supabase BaaS (less control, not Azure-native).

### Database — **PostgreSQL → Azure Database for PostgreSQL (Flexible Server)**
- **Why:** Relational itinerary data (trips → days → items) fits Postgres; managed Flexible
  Server gives backups, scaling, and HA on Azure.
- **Local dev path:** in-memory seed data → local PostgreSQL → Azure Postgres (provider swap only).
- **Authorization:** enforced in the API/service layer; row ownership by `owner_id`.

### Auth — **Microsoft Entra External ID** (Azure AD B2C)
- **Why:** Azure-native identity with email + Google/Apple social logins; API validates JWT bearer tokens.
- **Local dev:** auth can be stubbed/bypassed behind a flag so the app runs without an identity tenant.

### AI & secret-bearing calls — **API endpoints + Azure OpenAI**
- **Why:** API keys (Azure OpenAI, Places, Weather) live in **Azure Key Vault**, never on the client.
  The API proxies these calls, enforces rate limits/quotas, and shapes prompts.
- **AI provider:** **Azure OpenAI Service** (swappable behind our own interface). Streaming for chat.
- **Pattern:** thin "tools" the assistant can call — `searchPlaces`, `getWeather`,
  `addItineraryItem` — so the AI edits the actual trip rather than returning prose.
- **Three AI surfaces, one provider:** (1) planning assistant, (2) recap generation, (3) RAG
  discovery — all behind a single `ILlmClient`/`IEmbeddingClient` so the model is swappable.

### Notes, journaling & media capture (Phase 4)
- **Notes** are polymorphic: scoped to an **event**, a **day**, or the **trip** (`scope` + `target_id`).
- **Voice notes:** record on-device → upload audio to **Azure Blob** → **Azure Speech-to-Text**
  produces a transcript (run async via Azure Functions). We keep **both** audio and transcript.
- **Journal-as-you-go:** notes anchor to a specific **itinerary item**, so the itinerary doubles as
  the journal timeline — the primary, low-friction capture surface.
- **Post-event notifications:** **local** notifications (expo-notifications) are scheduled from
  itinerary end times (+ delay) to prompt a summary and **deep-link to that event's** composer.
  Local scheduling means it **works offline** with no server push. Config: global / per-trip /
  per-event-type + quiet hours. **Azure Notification Hubs** is added later only for server-driven
  pushes (e.g., itinerary changes, collaborator activity).
- **Reflection prompts:** preset + user-defined; **toggleable globally and per trip**; responses are
  stored as notes linked to the prompt; can ride on post-event notifications.
- **Offline-first:** notes and recordings are created locally and queued in the sync outbox; media
  uploads resume on reconnect. **A recording is never lost.**
- **Photos** attach to notes (Blob), same pipeline.

### AI recap & export (Phase 6)
- **Input:** a trip's notes + transcripts (+ itinerary context, optional photos).
- **Process:** Azure OpenAI summarizes at **event / day / trip** granularity into an editable recap;
  tone/format options; **grounded in the user's own notes** (no invented facts).
- **Export:** render to **PDF** and a **shareable web page**; optional photo inclusion.
- **Storage:** recap is a first-class entity (editable, versioned), separate from raw notes.

### Sharing & real-time collaboration (Phase 7)
- **Two share modes:** **link** (capability token, viewer needs no account) and **in-app accounts**
  (friends). Access governed by `TripShare` + `TripMember` with roles **owner / editor / viewer**.
- **Real-time co-edit:** **Azure Web PubSub / SignalR** for presence + live updates.
- **Conflict handling:** upgrade from last-write-wins toward operational merge; evaluate **CRDTs** if
  free-form co-editing needs it. Sync stays behind an interface so the strategy can change.
- **Reactions** on trips/events/recaps; **shared notes** double as comments.

### Public discovery & RAG (Phase 8)
- **Publishing** a recap is an explicit, per-recap **opt-in**, allowed **only after the trip end
  date** (server-enforced safety gate); PII is reviewed/redacted first.
- **Moderation:** **Azure AI Content Safety** + user reporting + takedown + human review queue.
- **Search:** keyword + **semantic** (embeddings) over **consented public recaps**, filterable by
  place / activity / season / budget.
- **RAG discovery assistant:** question → retrieve relevant public recaps from the **vector index** →
  Azure OpenAI answers **with citations**, and surfaces **clonable itineraries**. Falls back to
  "no good source yet" rather than hallucinating.
- **Vector store (locked, implemented as of Phase 8 Slice 2):** Postgres, not a separate service —
  as planned. Embeddings are stored as a plain `float[]` column (`embedding_chunks.Vector`, `real[]`
  under Npgsql) rather than the native pgvector `vector` type, and similarity is computed
  **client-side** (cosine similarity) instead of via SQL/pgvector-operator translation. This avoids
  depending on the `pgvector` Postgres extension being enabled and — more importantly — means the
  exact same retrieval code runs identically against the EF Core in-memory provider in tests and
  real Postgres in prod. Fine at today's corpus size; the retrieval/indexing layer sits behind
  `ISearchService`, so swapping in a native `vector` column + ANN index (ivfflat/hnsw) or moving to
  **Azure AI Search** later doesn't require touching callers. Indexing runs synchronously on the
  publish/approve path today; a true async job is a future move once latency/scale justify it.
- **Training:** **RAG first.** Any future **fine-tuning** requires separate, explicit training consent
  and a PII-scrubbed corpus — see `privacy-consent-moderation.md`.

### Privacy, consent & moderation (cross-cutting)
- **Consent flags** on user and per-recap control **share / publish / AI-training** independently and
  are **revocable**; every read path filters by consent + visibility.
- **PII detection/redaction** before any content becomes public or enters the discovery index.
- **Data rights:** export and deletion; audio/transcript retention policy; deleting a trip purges its
  media and removes it from the discovery index.

### External integrations
| Need | Choice | Notes |
|---|---|---|
| Maps & places | **Mapbox** (or Azure Maps) | Autocomplete, geocoding, map tiles |
| Routing / directions | **Azure Maps Route** (or Google Directions) | In-app drive time/distance |
| Navigation hand-off | **Deep link to Google/Apple Maps** | Turn-by-turn opens the native Maps app; no key |
| Weather | Open-Meteo → Azure Maps Weather | Forecast vs. climate normals by date |
| Calendar (write) | `expo-calendar` (on-device) + `.ics` | Creates events in Apple/Google device calendars; Google Calendar API (two-way) later |
| Voice → text | **Azure Speech-to-Text** | Transcribe voice notes (async) |
| AI (plan/recap/RAG) | **Azure OpenAI** (LLM + embeddings) | One provider, three surfaces |
| Discovery index | **pgvector** (initial) → Azure AI Search (optional later) | Start simple; upgrade when scale/hybrid search needs demand it |
| Moderation | **Azure AI Content Safety** | Public UGC + reporting/takedown |
| Realtime | **Azure Web PubSub / SignalR** | Presence + live co-editing (now core) |
| Media | **Azure Blob Storage** | Audio, photos; signed URLs, lifecycle policies |
| Background jobs | **Azure Functions** | Transcription, embeddings, recap, moderation |
| Payments (v2) | **Stripe** | Premium tier / subscriptions |
| Secrets | **Azure Key Vault** | All provider keys |

---

## 4. Data model (core entities)

```
User ──< Trip ──< Day ──< ItineraryItem
                       └─< PackingItem
                       └─< Document (confirmations, files in Storage)

User ── Preferences (units, travel style, diet, budget band, pace)
User ── ConsentSettings (share / publish / ai_training — each opt-in, revocable)

# Capture (Phase 4)
Note            { scope: trip|day|event, target_id, author_id,
                  body_text?, kind: text|voice|prompt_response }
  └─ MediaAsset { kind: audio|photo, blob_url, duration?, transcript? }
JournalPrompt   { text, is_preset, enabled_global, enabled_per_trip }
PromptResponse  → Note (links a prompt to its answer)

# Recap (Phase 6)
Recap { trip_id, scope: trip|day|event, target_id, body (editable),
        generated_from[note_ids], status: draft|final, export_urls[] }

# Sharing & collaboration (Phase 7)
TripShare   { trip_id, mode: link|account, token?, role, expires? }
TripMember  { trip_id, user_id, role: owner|editor|viewer }
Reaction    { target: trip|event|recap, target_id, user_id, emoji }

# Public discovery (Phase 8)
PublicRecap { recap_id, visibility: public, consent_verified, moderation_status,
              places[], tags[], season, budget_band }
EmbeddingChunk { source: public_recap, source_id, vector, text }  # vector index

ItineraryItem: { type: flight|lodging|food|activity|transport,
                 title, start, end, location(lat/lng/place_id),
                 cost, currency, confirmation_no, booking_url }
                 # booking_url = optional reservation/voucher link (e.g. GetYourGuide)
```
- Every table carries `id (uuid)`, `created_at`, `updated_at`, `owner_id`, `deleted_at` (soft delete for sync).
- **Sharing & consent fields exist from Phase 0** so later phases are additive, not rewrites.
- Deleting a trip cascades to its notes/media and **removes it from the discovery index**.

---

## 5. Environments & delivery (Azure)
- **Environments:** `local` → `staging` → `production`.
- **Execution timing:** active deployment rollout is deferred to **Phase 3**; Phases 0–2 are local-first.
- **API hosting (locked):** ASP.NET Core on **Azure App Service**.
- **Database:** **Azure Database for PostgreSQL** (Flexible Server) per environment.
- **Web hosting:** Expo web export to **Azure Static Web Apps**.
- **Mobile:** **EAS Build** for native binaries; **EAS Update** for OTA JS updates; app stores.
- **CI/CD:** GitHub Actions / Azure DevOps — build, test, `dotnet ef` migrations, deploy to Azure.
- **Secrets:** **Azure Key Vault** + EAS secrets; never committed.
- **Caching (API):** see §6 below.

---

## 6. Cross-cutting concerns
- **Observability:** Application Insights (API) + Sentry (client crashes), basic product analytics.
- **Security:** ownership checks in the API, HTTPS only, AI/Places calls quota-limited per user.
- **Accessibility:** WCAG-minded components, dynamic type, sufficient contrast.
- **i18n:** copy externalized from day one (travel = international users).
- **Cost control:** cache Places/Weather responses; cap AI tokens per user/day.

### API caching strategy

| Phase | Cache | Reason |
|---|---|---|
| **0–2 (local-first)** | `IMemoryCache` (in-process) | Zero infrastructure; works on a single App Service instance. |
| **3+ (cloud)** | **Azure Cache for Redis** via `IDistributedCache` | Multiple App Service instances each have independent in-process caches; a shared Redis instance eliminates duplicate provider fetches across instances and survives restarts. |

**Current state:** `CachingPlaceProvider` and `CachingWeatherProvider` both depend on `IMemoryCache`
injected via `Program.cs`. The decorators contain no cache-technology-specific code.

**Upgrade path (Phase 3):**
1. Provision an **Azure Cache for Redis** instance (one per environment).
2. Add `builder.Services.AddStackExchangeRedisCache(...)` to `Program.cs`.
3. Update `CachingPlaceProvider` and `CachingWeatherProvider` to take `IDistributedCache`
   instead of `IMemoryCache` — serialise/deserialise with `System.Text.Json`.
4. Remove `AddMemoryCache()` (or keep for other consumers).
5. Add the Redis connection string to Key Vault (`Cache:RedisConnectionString`).

No controller or provider implementation changes are needed — the caching is fully
encapsulated in the decorator layer.

---

## 7. Units & weather data

### Units (temperature, distance, currency)
- **Temperature unit is a user preference** (`'F' | 'C'`), defaulting to **Fahrenheit**.
- **Canonical storage is metric (Celsius).** Weather APIs return metric and it keeps a single
  source of truth; the **client converts at display time** via `formatTemp(celsius, unit)`
  (`app/src/format.ts`).
- **Current state:** the preference lives in app state and is toggled in **Profile**
  (`app/src/screens/ProfileScreen.tsx`). It is **not yet persisted**.
- **Future:** persist the preference to the user's account once Microsoft Entra External ID auth
  lands (and cache on-device for offline). Apply the same pattern to **distance** (mi/km) and
  **currency** display. Keep all conversion at the presentation layer — never store imperial.

### Weather data source (Phase 2)
- **Live weather is now implemented** via `IWeatherProvider` / `OpenMeteoWeatherProvider`.
  The API proxies the call (`GET /api/trips/{id}/weather`) so provider keys stay in **Azure Key Vault**.
- **Provider plan:**
  - **Dev / first integration → Open-Meteo.** No API key, free, forecast + historical archive endpoints.
    Auto-selected when no key is configured; `FakeWeatherProvider` available for CI (`Weather:UseFake=true`).
  - **Production → Azure Maps Weather** (built on AccuWeather): Azure-native billing, Key Vault,
    and SLA. Swappable behind `IWeatherProvider` with no UI changes.
- **Date-based source selection:** trips can be months out, but forecasts only reach ~16 days.
  - Trip day **≤ ~16 days away** → live **forecast** (`api.open-meteo.com/v1/forecast`).
  - Further out → **historical archive** for the same calendar date one year prior, labeled
    "typical for this time of year" (`isClimateSummary: true`).
- **Caching:** `CachingWeatherProvider` decorator; cache key = `(lat/lng rounded to 2 dp, date)`.
  Forecast TTL 2 h; climate/historical TTL 24 h.
- **Units:** store and fetch Celsius; client converts to °F/°C at display time via `formatTemp`.

### Weather granularity — day vs. location vs. hour

**Current state (Phase 2 slice 2):**
- Weather is modelled as **(location, date)** — fetched per located item, not per "day".
- Day header shows a **representative summary** from the day's first located item.
- Items without coordinates show no weather badge.
- WMO weather codes map to emoji via `wmoEmoji(code)` in `app/src/format.ts`.

**Multi-location days** (e.g. Sicily coast + mountains):
- Each located stop fetches its own observation; nearby stops share one cached fetch.
- Day header is a single representative glance; per-stop badges show the real local conditions.

**Hourly weather (deferred to Phase 4/6 — journaling / recap):**
- During active travel, hourly precision matters ("will it rain at 2 PM at the Colosseum?").
  Daily high/low is sufficient for planning; hourly during planning is noise.
- Open-Meteo supports `hourly=temperature_2m,weather_code,precipitation_probability` on the
  same endpoint — the response gives 24 values per day for the ≤16-day forecast window.
- Implementation path: add `GetHourlyAsync(lat, lng, date, ct)` to `IWeatherProvider`
  (or a separate `IHourlyWeatherProvider`); cache key adds `+ hour` or caches the full day
  array under one key and slices client-side. No schema changes needed — hourly data is
  display-only, not persisted.
- **UI home:** the itinerary item detail/edit screen (Phase 4) and the trip recap timeline
  (Phase 6) are the natural surfaces — not the day-list view.

**Two regimes for the same location:**
- *Forecast/climate* for planning (future trips).
- **Historical actuals per location** for recaps of past trips (Phase 6/8): query the
  Open-Meteo archive API for the exact date visited — a multi-town recap then reflects the
  real weather at each town on the day it was visited.

**Data-model implication (future, not now):** the canonical store becomes a `WeatherObservation`
cache keyed by `(lat/lng, date)`; `Day.weather*` fields remain as a cached *representative* summary,
and per-stop weather attaches to the itinerary item's location. Today's day-level fields stay as-is
for the prototype.

## 8. Key trade-offs accepted
1. **.NET API + Azure over a BaaS** — more to build than Supabase, but full control and best-in-class Azure deployment for our skill set.
2. **One cross-platform client codebase** — occasional platform-specific polish needed, but ~70% effort saved vs. separate apps.
3. **In-memory fake data first** — lets the full app run locally on day one; the EF Core layer makes the swap to real Postgres a config change.
4. **Collaboration is now core (not v2)** — identity, sharing, and consent are modeled from Phase 0;
   real-time co-edit lands in Phase 7. Sync moves from last-write-wins toward operational merge/CRDTs.
5. **RAG before fine-tuning for discovery** — grounded, current, and consent-clean; fine-tuning is a
   later, separately-consented option.
6. **Keep audio + transcript** — more storage, but preserves authenticity and enables re-transcription.
7. **Consent gates on every read path** — small per-query cost for strong privacy guarantees.
