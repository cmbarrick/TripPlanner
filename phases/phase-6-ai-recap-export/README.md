# Phase 6 — AI Recap & Export

> Goal: Turn captured notes into an editable, shareable **recap** — and export it.
> Est: ~2–3 weeks · Depends on: Phase 4 (notes & transcripts), Phase 5 (AI plumbing)

## Objectives
- Summarize a trip's notes (text + voice transcripts) into a recap at event/day/trip level.
- Keep the user in control: editable, grounded in their own notes, no invented facts.
- Export to a polished PDF and a shareable web page.

## Scope / tasks
- [x] **Slice 0 (Phase 5 carry-over): in-trip AI dock** — functional composer on the trip planner
      (List/Split views); typed prompt opens Assistant chat pinned to the open trip and auto-sends.
      Degrades gracefully when `GET /api/ai/status` reports AI off; "Undo AI" kept for live chat batches.
- [x] **Recap generation** via Azure OpenAI at **event / day / whole-trip** granularity
      (`POST /api/trips/{id}/recaps/generate`; `RecapGenerationService` on the cheaper draft deployment).
      App UI exposes trip + day scope; event scope is supported by the API (UI entry deferred).
- [x] **Historical weather actuals in recaps:** for each past itinerary event that has coordinates,
      fetch the real weather on the day it was visited via the Open-Meteo archive API
      (`archive-api.open-meteo.com/v1/archive`; forecast endpoint covers the archive's ~5-day lag).
      Injected into the recap prompt only ("it was 34°C and sunny at the Valley of the Temples"),
      hourly fact added when the item has a start time. Cached at `(lat/lng ±1 km, date)` with
      **no expiry** (archive data is immutable) via `CachingHistoricalWeatherProvider`.
- [x] **Tone/format options** — narrative, highlights, bullets picker in the recap panel.
- [x] **Grounding:** prompt context is restricted to the user's notes/transcripts (+ itinerary and
      fetched weather facts); strict no-invention rules; the model cites note labels per section and
      `RecapValidator` drops any citation that doesn't map to a real source note.
- [x] **Editable draft → final:** draft persists; `PUT` saves bump `version`; `POST …/finalize`
      locks status. Section→note citation counts shown in the editor.
- [x] **Export:** server-rendered **PDF** (QuestPDF) + **unlisted shareable web page**
      (`/share/recaps/{token}`, noindex, capability token only — public publishing is Phase 8);
      optional photo inclusion (journal photos embedded in the PDF; share page is text-only for now).
- [x] **Cost controls:** shared daily token quota (`AiTokenQuotaService`), source-fingerprint
      dedupe (regenerating with unchanged notes returns the existing draft, zero tokens), cheaper
      draft model for recaps.

## Out of scope
- Public publishing/searchability and discovery (Phase 8); real-time sharing (Phase 7).

## Testing plan
- [ ] **AI evals:** recap **faithfulness** (no facts beyond notes), coverage of key events, tone.
      *(Deferred with the Phase 5 golden-eval suite — structural grounding is enforced in code:
      context whitelisting + citation validation.)*
- [x] **Unit:** recap assembly, note→section linkage, versioning, prompt grounding, weather
      injection, markdown/PDF/HTML rendering (`RecapTests.cs`, `RecapExportTests.cs`; 152 backend
      tests green).
- [ ] **Integration:** generate → edit → export PDF/web; photo inclusion. *(Service/repository
      layers unit-tested with `FakeAiProvider`; live end-to-end deferred to cross-phase hardening.)*
- [x] **Cost:** quota enforcement test; fingerprint dedupe test proves regeneration with unchanged
      notes spends no tokens.
- [x] **Regression:** Phases 0–5 suites green (backend 152/152, app 93/93, `tsc` clean).

## Exit criteria
- Generate an **editable** trip recap from notes; export a polished PDF/web page.
- Recap quality passes eval thresholds; **no fabricated facts** beyond the user's notes.

## Artifacts
- Mockups: to be added (recap view, tone picker, export sheet).
