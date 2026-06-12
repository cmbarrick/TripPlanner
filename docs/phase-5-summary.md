# Phase 5 Summary — AI Planning Assistant

Date: 2026-06-08
Status: **✅ Closed (2026-06-08).** Slices 0–4 shipped on **dev**; core exit criteria met for draft
generation, chat tool-calling, preference-aware prompts, token quotas, visible trip changes, and
batch undo. Non-blocking items are **deferred by decision** (validation hardening, in-trip AI dock
composer, undo on Generate Apply) — documented below, not blocked for dev use or Phase 6 kickoff.

---

## Outcome

Phase 5 adds an **AI planning assistant** that edits the **real trip**, not a side conversation. Users
can **generate an ephemeral itinerary draft** from a prompt (preview → accept as Tentative items), or
**chat** with Wander to search places, check weather, add/move/remove stops, and analyze schedule gaps.
All mutations go through the existing trip repository and respect ownership, validation, and item status
rules (AI-created items land as **Tentative**).

The assistant is **preference-aware** (travel style, pace, diet, budget band from Profile) and
**quota-governed** (daily token budget per user in Postgres). When AI is not configured, the Assistant
tab degrades gracefully (`GET /api/ai/status` → disabled). Orchestration runs in the **ASP.NET API**
(App Service) with **SSE streaming** for chat; Azure Functions remain for async work (e.g. transcription).

Each chat turn that mutates the itinerary emits a **batch id** and **undo steps**; the client can call
`POST /api/ai/trips/{id}/undo` or tap **Undo last AI batch** (Assistant) / **Undo AI** (trip planner
dock, when a chat batch exists in the current session). Basic **guardrails** block common
prompt-injection patterns and cap chat requests at 20/minute per user (token quota unchanged).

### Where to use AI (UX)

| Surface | What works |
|---|---|
| **Assistant tab** (✨) | **Chat** — tool-calling edits that persist; **Generate** — ephemeral draft → Apply to trip |
| **Trip planner AI dock** | ✅ Functional composer (shipped Phase 6 Slice 0) — typed prompt opens Assistant chat pinned to the open trip and auto-sends; **Undo AI** appears after a **chat** batch (same session) |
| **Profile** | Travel preferences (style, pace, diet, budget) injected into generate + chat prompts |

The mockup **in-context composer** on the trip screen (`mockups/option-4-map-ai-planner.html`) was
deferred from this phase and shipped as **Phase 6 Slice 0** — the dock is now a real composer that
hands off to Assistant chat with the trip pinned.

---

## What Was Completed

### Slice 0 — AI seam
- `IAiProvider` with `DisabledAiProvider`, `FakeAiProvider` (CI), and `AzureOpenAiProvider` (dev/prod).
- `AiPromptBuilder`, `AiTokenQuotaService`, Postgres `ai_token_usage` migration.
- `GET /api/ai/status` — enabled flag + daily quota headroom.
- Assistant tab shows a graceful off state when AI is not configured.

### Slice 1 — Preferences
- Extended `Preference` model: `TravelStyle`, `Pace`, `Diet`, `BudgetBand`; migration
  `AddTravelPlanningPreferences`.
- `GET/PUT /api/preferences`; Profile UI segments; preferences injected into generate + chat prompts.

### Slice 2 — Ephemeral itinerary generation
- `POST /api/ai/trips/{tripId}/generate-itinerary` — strict JSON schema draft via `gpt-4o-mini`
  (`DraftDeployment`).
- `AiItineraryDraftService`, `AiDraftValidator`, `AiItineraryDraftSchema`.
- App: Generate tab — preview → **Apply to trip** (creates Tentative items via existing CRUD).

### Slice 3 — Chat + tool-calling + SSE
- `POST /api/ai/trips/{tripId}/chat` — SSE events: `text_delta`, `tool_start`, `tool_result`,
  `trip_changed`, `done`, `error`.
- `AiPlanningService` tool loop (max 8 rounds); `gpt-4o` chat deployment.
- Tools: `searchPlaces`, `getWeather`, `addItineraryItem`, `moveItem`, `removeItem`, `suggestGapFill`.
- `AiGapFill.FindGaps()` for gap-fill analysis.
- App: `AssistantChatPanel`, Chat/Generate toggle, `streamAiChat()` + `chatStream.ts`.

### Slice 4 — Batch undo + guardrails
- Undo metadata from mutating tools (`deleteItem` / `restoreItem` / `moveItem` steps).
- `POST /api/ai/trips/{tripId}/undo` — `AiUndoService` applies steps in reverse order.
- `AiInputGuard` — prompt-injection pattern rejection on chat + generate prompts.
- `AiChatRateLimiter` — 20 chat requests/minute per user (`IMemoryCache`).
- App: `aiBatchStore` (session), undo buttons in Assistant + trip planner AI dock.

### Cloud (dev)
- Azure OpenAI resource `oai-wander-dev-azgnto` wired via GitHub secrets
  `WANDER_AZURE_OPENAI_ENDPOINT` + `WANDER_AZURE_OPENAI_API_KEY` on the `dev` environment.
- Mixed deployments: `ChatDeployment` = gpt-4o, `DraftDeployment` = gpt-4o-mini.

---

## Key API surface

| Endpoint | Purpose |
|---|---|
| `GET /api/ai/status` | AI enabled + token quota snapshot |
| `GET/PUT /api/preferences` | Travel planning preferences |
| `POST /api/ai/trips/{id}/generate-itinerary` | Ephemeral draft JSON |
| `POST /api/ai/trips/{id}/chat` | SSE chat with tool-calling |
| `POST /api/ai/trips/{id}/undo` | Reverse an AI mutation batch |

---

## Tests at close

- Backend **125/125** — prompt builder, quota, draft validation, tools, gap-fill, chat orchestration
  (fake provider), undo service, input guard.
- App **80/80** — incl. `chatStream` SSE parsing; `tsc` + lint clean.
- **Not yet automated:** integration suite, golden AI evals, full E2E (draft → chat → persist → undo).

---

## Exit criteria (sign-off)

| Criterion | Met |
|---|---|
| Prompt → editable draft itinerary | ✅ Generate tab + ephemeral preview |
| Chat adds/modifies/reorders items that persist | ✅ Tool-calling via SSE chat |
| Visible changes + undo | ✅ Activity rail + undo API (chat batches only) |
| Respects user preferences | ✅ Profile preferences in prompts |
| Stays within token quotas | ✅ Postgres daily quota + status endpoint |
| AI eval suite passes quality thresholds | ⏸ Deferred — golden eval suite not automated yet |

---

## Deferred items (documented, not blocked)

| Item | Target | Notes |
|---|---|---|
| **In-trip AI dock composer** | ✅ Done — Phase 6 Slice 0 (2026-06-11) | Composer on trip planner hands the prompt to Assistant chat (trip pinned, auto-sent); AI-off state degrades gracefully |
| Integration tests | Cross-phase hardening | Tool mutations persist; preferences in prompts; quota blocks |
| Golden AI eval suite | Phases 5–6 on AI changes | Structure, diet/budget, no hallucinated bookings, pacing |
| Automated E2E | Cross-phase hardening | Draft → chat tweak → persist → undo |
| Expanded safety evals | Phases 5–8 | Basic regex guard only today |
| Undo on Generate **Apply** | Backlog | Undo covers **chat tool batches** only |
| Live LLM smoke | Manual | Dev Azure OpenAI; unit tests use `FakeAiProvider` |

---

## What's next

**Phase 6 — AI Recap & Export:** summarize notes (text + transcripts) into editable recaps at
event/day/trip level; export to PDF/web; faithfulness evals. Reuses Phase 5 AI seam (`IAiProvider`,
quota, Azure OpenAI wiring).
