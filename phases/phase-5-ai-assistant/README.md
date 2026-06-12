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
