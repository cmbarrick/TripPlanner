# Phase 6 Summary — AI Recap & Export

Date: 2026-06-12
Status: **✅ Implemented on dev (web).** Slices 0–5 built: in-trip AI dock (Phase 5 carry-over),
grounded recap generation at trip/day/event scope, historical weather actuals in recap context,
editable versioned drafts with citations, and PDF + unlisted share-page export. Golden AI evals and
live integration/E2E remain deferred (same posture as Phase 5).

---

## Outcome

Phase 6 turns the journal (Phase 4 text notes + voice transcripts) into an **editable, grounded
recap** the traveler owns. Generation reuses the Phase 5 AI seam (`IAiProvider`, daily token quota,
Azure OpenAI on dev; `FakeAiProvider` in CI) on the **cheaper draft deployment**. The model writes
ONLY from the user's notes/transcripts plus itinerary facts and **real weather actuals** fetched for
the days/places visited — and must cite, per section, which notes informed it. Citations that don't
map to a real source note are dropped server-side, so a recap can never reference an invented source.

Drafts persist as a first-class **versioned `Recap` entity** (`scope: trip|day|event`, `target_id`,
editable body, `generated_from[note_ids]`, `status: draft|final`, `export_urls[]`). Users edit the
markdown body, save (version bump), finalize, and export: a **server-rendered PDF** (QuestPDF,
optional journal photos) or an **unlisted share page** at `/share/recaps/{token}` (capability token,
`noindex`; public publishing with consent + moderation stays in Phase 8).

**Slice 0** also shipped the deferred Phase 5 item: the trip planner's AI dock is now a real
composer — typing there jumps to the Assistant tab with Chat mode, the open trip pinned, and the
message auto-sent (smallest-diff option A; one chat surface, no duplicated stream/undo UI).

## Where to use it (UX)

| Surface | What works |
|---|---|
| **Trip planner ✨ Recap panel** | Scope (whole trip / day) + tone (narrative/highlights/bullets) → generate → edit → save → finalize → PDF / share link; per-section "from N notes" citations |
| **Trip planner AI dock** | Functional composer → Assistant chat for the open trip; Undo AI for live chat batches; passive notice when AI is off |
| **Share page** | `/share/recaps/{token}` standalone HTML, anonymous, unlisted |

## What was completed

### Slice 0 — In-trip AI dock (Phase 5 carry-over)
- `AiDock` extracted to its own component: composer input + send; respects `GET /api/ai/status`.
- `uiStore.openAssistant(prompt)` hands the prompt across tabs; `AssistantChatPanel` consumes and
  auto-sends it. "Phase 5" badge removed.

### Slice 1 — Recap domain + API
- `Recap` entity + `AddRecaps` migration (`recaps` table, uuid[]/text[] columns, unique share token).
- `IRecapRepository` / `EfCoreRecapRepository` with the standard ownership checks; soft delete.
- `RecapsController`: `POST generate`, `GET` list, `GET` by id, `PUT` save draft (version bump),
  `POST finalize`, `POST share`, `GET pdf`, `DELETE`.
- `RecapPromptBuilder` (strict grounding rules, n1..nN citation labels), `RecapSchema` (strict JSON),
  `RecapValidator` (parse + citation mapping + body composition).
- Quota: same `AiTokenQuotaService` daily budget; `SourceFingerprint` dedupe avoids paying twice for
  unchanged sources.

### Slice 2 — Historical weather actuals
- `IHistoricalWeatherProvider` + `OpenMeteoHistoricalWeatherProvider` (archive API; forecast endpoint
  bridges the ~5-day archive lag; daily + hourly in one call).
- `CachingHistoricalWeatherProvider`: `(lat/lng ±1 km, date)` key, **no expiry** (immutable data).
- Facts injected into the recap prompt only; hourly "around 14:00 it was 29°C" when the stop has a
  start time. `FakeHistoricalWeatherProvider` for CI (`Weather:UseFake=true`).

### Slice 3 — App UI
- `RecapPanel` on the trip planner (✨ Recap toggle): scope/tone pickers, generate, recap list,
  editable title/body, save/finalize, citation lines, share-link copy, PDF download (+ photos toggle).
- `queries/recaps.ts` + recap API client functions (incl. blob PDF download web/native paths).

### Slice 4 — Export
- `RecapExportService`: QuestPDF A4 PDF (brand-styled header/footer, markdown blocks, embedded
  photos from grounding notes, capped at 12) and standalone share-page HTML (HTML-encoded, noindex).
- `RecapShareController` (`/share/recaps/{token}`, `[AllowAnonymous]`).
- `RecapMarkdown` mini block parser shared by both renderers.

## Key API surface

| Endpoint | Purpose |
|---|---|
| `POST /api/trips/{id}/recaps/generate` | Grounded AI draft (scope, targetId, tone) |
| `GET /api/trips/{id}/recaps` · `GET …/{recapId}` | List / fetch |
| `PUT /api/trips/{id}/recaps/{recapId}` | Save edit (version bump) |
| `POST /api/trips/{id}/recaps/{recapId}/finalize` | Draft → Final |
| `POST /api/trips/{id}/recaps/{recapId}/share` | Issue unlisted share link |
| `GET /api/trips/{id}/recaps/{recapId}/pdf?includePhotos=` | PDF export |
| `GET /share/recaps/{token}` | Anonymous share page |

## Tests at close

- Backend **152/152** — prompt grounding/labeling, citation validation (hallucinated labels
  dropped), scope filtering, weather injection + future-date exclusion, quota + fingerprint dedupe,
  repository versioning/finalize/share-token/soft-delete/ownership, markdown parsing, real PDF
  bytes, HTML escaping/noindex, indefinite weather cache.
- App **93/93** + `tsc` clean — uiStore handoff, AiDock states, RecapPanel (off state, scope/tone →
  generate payload, citations rendering).

## Exit criteria (sign-off)

| Criterion | Met |
|---|---|
| In-trip dock: chat/tweak from trip planner for the open trip | ✅ Slice 0 |
| Generate editable recap from notes at event/day/trip scope | ✅ API all three; UI trip+day |
| User edits before saving; recap versioned | ✅ PUT bumps version; finalize locks |
| Export PDF + shareable web page | ✅ QuestPDF + unlisted share page |
| Recap draws only from notes/transcripts (+ weather/itinerary context) | ✅ context whitelist + citation validation |
| Token quotas enforced | ✅ shared daily quota + dedupe |
| AI eval suite passes thresholds | ⏸ Deferred — golden evals not automated (with Phase 5's) |

## Deferred items (documented, not blocked)

| Item | Target | Notes |
|---|---|---|
| Golden faithfulness evals | Phases 5–8 AI eval suite | Structural grounding enforced in code today |
| Event-scope recap UI entry | UX polish | Backend supports `scope: Event`; add from item editor |
| Photos on the share page | Phase 8 publishing | Needs anonymous-safe media URLs; PDF embeds photos now |
| Live integration/E2E (generate→edit→export) | Cross-phase hardening | Unit-tested via `FakeAiProvider` |
| PDF font check on Linux App Service | Deploy validation | QuestPDF/SkiaSharp font availability on dev deploy |

## What's next

**Phase 7 — Sharing & Collaboration:** share by link + accounts, real-time co-edit, reactions.
Recap share tokens here are a single-recap preview of the Phase 7 link-capability pattern.
