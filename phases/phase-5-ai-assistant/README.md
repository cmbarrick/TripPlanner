# Phase 5 — AI Assistant

> Goal: Accelerate planning with an AI that **edits the real trip** (not just chats).
> Est: ~3 weeks · Depends on: Phase 3 (cloud infra for AI orchestration)

## Objectives
- Generate editable itineraries from a prompt.
- Provide a chat assistant that performs actions via tool-calling and respects preferences.

## Scope / tasks
- [x] **Slice 0 — AI seam:** `IAiProvider` + `DisabledAiProvider` / `FakeAiProvider` / `AzureOpenAiProvider`;
      API-side orchestration (App Service, not Edge Function); `AiPromptBuilder`; Postgres daily token quota;
      `GET /api/ai/status`; Assistant tab degrades gracefully when AI is off.
- [x] **Slice 1 — Preferences:** extend `Preference` (travel style, pace, diet, budget band);
      `GET/PUT /api/preferences`; Profile UI; `AiPromptBuilder.FormatUserPreferences` for prompt tail.
- [ ] **Itinerary generation:** prompt (destination, dates, interests, budget, pace) →
      **ephemeral** draft preview; user accepts → persisted via existing item CRUD.
- [ ] **Chat assistant** with **tool-calling**: `searchPlaces`, `getWeather`,
      `addItineraryItem`, `moveItem`, `removeItem`, `suggestGapFill`.
- [ ] **Preference-aware output:** uses stored user preferences (diet, style, pace, budget). *(storage + Profile UI in Slice 1; wired into prompts in Slice 2+)*
- [ ] **Smart gap-fill:** suggest activities for empty time slots near current stops.
- [ ] **Streaming responses** in chat UI; show what the AI changed (diff/undo).
- [ ] **Guardrails:** rate limiting, prompt-injection mitigation, safe-content checks (quota started in Slice 0).

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
- [ ] **Unit:** tool argument parsing/validation.
- [ ] **Integration:** tool calls actually mutate the itinerary and persist; preferences flow
      into prompts; quota blocks when exceeded; provider wrapper is swappable (mocked).
- [ ] **AI evals (golden set):** a suite of prompts scored for: valid structure, respects
      constraints (dates/budget/diet), no hallucinated bookings, sensible geography/pacing.
      Run on every prompt or model change.
- [ ] **E2E:** "Plan 3 days in Lisbon, foodie, mid-budget" → draft appears & is editable →
      in chat "make day 2 more relaxed" → itinerary updates and persists → undo works.
- [ ] **Safety:** prompt-injection and unsafe-request test cases handled.
- [ ] **Regression:** Phases 0–3 suites green.

## Exit criteria
- From a prompt, the AI produces an **editable** draft itinerary.
- In chat, the AI can add/modify/reorder items that **persist**, with visible changes + undo.
- Respects user preferences and stays within token quotas.
- AI eval suite passes the agreed quality thresholds.

## Artifacts
- Mockups: `../../mockups` (AI Assistant chat, Generate Itinerary)
