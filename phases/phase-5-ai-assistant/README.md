# Phase 5 — AI Assistant

> Goal: Accelerate planning with an AI that **edits the real trip** (not just chats).
> Est: ~3 weeks · Depends on: Phase 3 (cloud infra for AI orchestration)

## Objectives
- Generate editable itineraries from a prompt.
- Provide a chat assistant that performs actions via tool-calling and respects preferences.

## Scope / tasks
- [ ] **Edge Function AI orchestration** (OpenAI behind a provider-agnostic interface).
- [ ] **Itinerary generation:** prompt (destination, dates, interests, budget, pace) →
      editable draft itinerary inserted into the trip.
- [ ] **Chat assistant** with **tool-calling**: `searchPlaces`, `getWeather`,
      `addItineraryItem`, `moveItem`, `removeItem`, `suggestGapFill`.
- [ ] **Preference-aware output:** uses stored user preferences (diet, style, pace, budget).
- [ ] **Smart gap-fill:** suggest activities for empty time slots near current stops.
- [ ] **Streaming responses** in chat UI; show what the AI changed (diff/undo).
- [ ] **Guardrails:** per-user daily token quota, rate limiting, prompt-injection mitigation,
      safe-content checks.

## Out of scope
- Autonomous booking, payments (Later / v2).

## Testing plan
- [ ] **Unit:** prompt builders, tool argument parsing/validation, quota accounting.
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
