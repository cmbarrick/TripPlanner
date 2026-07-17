# Phase 5 — AI Assistant

> Goal: Accelerate planning with an AI that **edits the real trip** (not just chats).
> Est: ~3 weeks · Depends on: Phase 3 (cloud infra for AI orchestration)

> **Status: ✅ Closed (2026-06-08).** Slices 0–4 shipped on **dev**: AI seam, preferences, ephemeral
> draft generation, SSE chat + tool-calling, batch undo, input guard + chat rate limit. Chat and
> Generate live on the **Assistant tab**; the trip planner **AI dock** remains a placeholder composer
> (undo-only after chat batches). Non-blocking validation hardening and the in-trip composer are
> **deferred** — see [`docs/phase-5-summary.md`](../../docs/phase-5-summary.md).

## Objectives
- Generate editable itineraries from a prompt.
- Provide a chat assistant that performs actions via tool-calling and respects preferences.

## Scope / tasks
- [x] **Slice 0 — AI seam:** `IAiProvider` + `DisabledAiProvider` / `FakeAiProvider` / `AzureOpenAiProvider`;
      API-side orchestration (App Service, not Edge Function); `AiPromptBuilder`; Postgres daily token quota;
      `GET /api/ai/status`; Assistant tab degrades gracefully when AI is off.
- [x] **Slice 1 — Preferences:** extend `Preference` (travel style, pace, diet, budget band);
      `GET/PUT /api/preferences`; Profile UI; `AiPromptBuilder.FormatUserPreferences` for prompt tail.
- [x] **Itinerary generation:** prompt → **ephemeral** draft preview via `POST /api/ai/trips/{id}/generate-itinerary`;
      user accepts → persisted as Tentative items via existing item CRUD.
- [x] **Chat assistant** with **tool-calling**: `searchPlaces`, `getWeather`,
      `addItineraryItem`, `moveItem`, `removeItem`, `suggestGapFill` via `POST /api/ai/trips/{id}/chat` (SSE).
- [x] **Real bookable activity options (2026-07-17):** `searchActivities` tool — real, currently-
      bookable tours/activities from `IActivityProvider` (Viator's Basic-Access affiliate API; no
      traffic-minimum gate, unlike GetYourGuide's partner program). The model can only ever
      *reference* an option by its `activityId`; it never sees or writes a booking URL/price
      itself — `addItineraryItem`'s optional `activityId` is re-resolved server-side via
      `IActivityProvider.GetDetailsAsync` before the item is saved, so a stale or invented id fails
      loud instead of silently attaching nothing (or something wrong). Same anti-fabrication
      discipline as Phase 6/8's citation validators, applied to tool-calling instead of RAG.
      `FakeActivityProvider` (dev/CI default) mirrors every other provider seam in this app.
      **Hidden behind `Activities:Enabled` (default `false`)** — `searchActivities` is fully built
      and tested but excluded from the tool list offered to the model until this flag flips on,
      independent of which provider is wired up. Kept off pending Viator sandbox key activation;
      flipping it on is a one-line config change, no code changes needed.
- [x] **Preference-aware output:** stored preferences flow into generate-itinerary and chat prompts (Profile UI in Slice 1).
- [x] **Smart gap-fill:** `suggestGapFill` tool analyzes empty schedule slots (Slice 3).
- [x] **Streaming responses** in chat UI; trip-change activity rail with **batch undo** (Slice 4).
- [x] **Guardrails:** rate limiting, prompt-injection mitigation (quota in Slice 0).

## Design decisions (locked)
- **Orchestration:** ASP.NET API (reuses repo/providers/auth; SSE streaming). Azure Functions stay for async work (transcription).
- **LLM:** Azure OpenAI — mixed deployments (`DraftDeployment` = mini, `ChatDeployment` = 4o).
- **Quota store:** Postgres `ai_token_usage` table (per user / UTC day).
- **Drafts:** Ephemeral client-side preview until user accepts (not inserted as Tentative rows).
- **No fine-tuning:** JSON schema + tool validation + prompt evals.

## Out of scope
- Autonomous booking, payments (Later / v2).

## Testing plan
- [x] **Unit (Slice 0):** prompt builder, quota accounting, disabled/fake providers.
- [x] **Unit (Slice 1):** preferences validation, per-user isolation, prompt preference formatting.
- [x] **Unit (Slice 2):** draft JSON validation, generate endpoint, fake provider draft, quota on generate.
- [x] **Unit (Slice 3):** tool argument validation, tool execution, gap-fill, chat orchestration with fake provider.
- [x] **Unit (Slice 4):** undo batch application, input guard, undo steps from tool executor.
- [x] **Unit (real activity options):** `searchActivities` returns real (fake-in-dev) options
      without ever exposing a `bookingUrl` to the model; `addItineraryItem` with a valid
      `activityId` attaches the provider's real URL + prefills cost; an unknown `activityId`
      throws rather than silently adding the item with no link; omitting `activityId` entirely
      leaves `bookingUrl` null (existing behavior, unchanged).
- [ ] **Integration:** tool calls actually mutate the itinerary and persist; preferences flow
      into prompts; quota blocks when exceeded; provider wrapper is swappable (mocked).
- [ ] **AI evals (golden set):** a suite of prompts scored for: valid structure, respects
      constraints (dates/budget/diet), no hallucinated bookings, sensible geography/pacing.
      Run on every prompt or model change.
- [ ] **E2E:** "Plan 3 days in Lisbon, foodie, mid-budget" → draft appears & is editable →
      in chat "make day 2 more relaxed" → itinerary updates and persists → undo works.
- [ ] **Safety:** prompt-injection and unsafe-request test cases handled. *(Basic guard in Slice 4; expand eval set over time.)*
- [ ] **Regression:** Phases 0–3 suites green.

## Exit criteria
- [x] From a prompt, the AI produces an **editable** draft itinerary.
- [x] In chat, the AI can add/modify/reorder items that **persist**, with visible changes + undo.
- [x] Respects user preferences and stays within token quotas.
- [ ] AI eval suite passes the agreed quality thresholds. *(Deferred — golden eval suite not automated.)*

## Deferred / carried forward

| Item | Notes |
|---|---|
| In-trip AI dock composer | Mockup in `option-4-map-ai-planner.html`; wire tap/type → chat for open trip → Phase 9 polish or pre–Phase 6 slice |
| Integration + E2E + golden evals | See testing plan below |
| Undo on Generate **Apply** | Chat tool batches only |
| Expanded safety evals | Basic `AiInputGuard` shipped |

## Artifacts
- Mockups: `../../mockups` (AI Assistant chat, Generate Itinerary)

## Progress log
- **2026-07-17** — **Real bookable activity options.** Considered GetYourGuide first — ruled out:
  every API tier requires existing traffic (100k+ monthly visits/50k downloads even for the
  cheapest "Teaser" tier; 1M+ traffic and 300 monthly bookings for the tier with actual
  availability data), so there's no path in pre-launch. Viator's Basic-Access affiliate API has no
  such gate — signup, get a key, done.
  New `Activities/` module (mirrors `Places/`): `IActivityProvider`/`ActivityOption`,
  `FakeActivityProvider` (dev/CI default, small hardcoded catalog), `ViatorActivityProvider` (real,
  config-selected when `Activities:ViatorApiKey` is set — same convention as every other provider
  seam). New `searchActivities` AI tool; `addItineraryItem` gained an optional `activityId` that
  the executor re-resolves server-side via `GetDetailsAsync` before ever writing a `BookingUrl` —
  the model can reference an id, it can never type a URL, price, or rating into existence. Search
  results shown to the model omit `bookingUrl` entirely (defense in depth: it literally can't
  hand-type a link it was never shown). `ChatAssistantRules` updated: must call `searchActivities`
  before recommending any bookable tour, must not claim a booking link exists unless a tool result
  confirmed it.
  **Verified against Viator's official Basic-Access Postman collection**
  (`docs.viator.com/partner-api/technical/Viator-Basic-Access-Affiliate-API-v2.postman_collection.json`,
  fetched directly since the interactive docs page was too large for automated fetching): base URL
  (`api.sandbox.viator.com/partner`), `exp-api-key` header, and `/products/{code}` GET all matched
  first-attempt assumptions; the `/search/freetext` POST body did not — `count` nests under
  `searchTypes[].pagination`, not flat, and a top-level `currency` is required — fixed to match
  once the real collection was in hand. Live-tested against the real sandbox with curl: the
  corrected request passes schema validation (a clean `401 Invalid API Key` from the auth layer,
  not a `400` body-validation error) — the sandbox key just hadn't finished Viator's own (up to
  24h) activation delay yet. **Response field names are still unverified** — the Postman
  collection documents requests, not example responses — so `ActivityOption`'s mapping
  (`pricing.summary.fromPrice`, `images[].url`, `reviews.combinedAverageRating`, `productUrl`)
  should be re-checked against a real response once the key activates; every field is
  nullable/optional specifically so a wrong guess degrades to a missing field, not a crash.
  **Tests: backend 240/240** (+9: 6 `AiToolExecutorTests`/`AiPlanningServiceTests` covering the
  full grounding guarantee, unaffected suites elsewhere unchanged).
- **Next:** once the Viator key activates, hand-verify a live `searchActivities` → `addItineraryItem`
  round trip end to end and correct any response field names that don't match; consider whether
  `/products/search` (destination-ID-based, supports date/price/rating filters) is worth the extra
  `/destinations` resolution step once Basic Access's freetext search proves too coarse.
- **2026-07-17** — **Kill switch.** Added `Activities:Enabled` (config, default `false`) as a
  dedicated gate on whether `searchActivities` appears in the model's tool list at all —
  `AiToolSchemas.All(bool activitiesEnabled)` filters it out when disabled. Lets the whole feature
  stay merged, built, and tested while remaining fully inert in production until the Viator key is
  confirmed working; re-enabling needs zero code changes, just flipping the flag. Two new tests
  lock in both states of the switch directly against `AiToolSchemas.All`. **Tests: backend
  242/242.**
