# Project Plan — Wander (Trip Planning App)

> Status: **Draft v2** · Owner: Project Manager · Last updated: 2026-07-14
> Progress: Phases 0–7 **closed** on dev. **Phase 8 — Public Recaps & Discovery** is in progress
> (Slices 0–3 of 5 built — publish gate, moderation, PII gate, search, and a grounded RAG discovery
> assistant are all backend-complete; only client UI + a hardening item remain — see
> [`phase-8-summary.md`](./phase-8-summary.md)).

A phased delivery plan that ships a usable product early and layers value with each phase.
Every phase has explicit **goals**, **deliverables**, **exit criteria**, and a **testing plan**.
Detailed task lists live in each phase folder under `/phases`.

---

## Product summary

**Wander** is a cross-platform (iOS / Android / Web) travel app built around a full lifecycle:

> **Plan → Experience → Reflect → Share → Discover**

- **Plan:** build a day-by-day itinerary on a map & calendar, with an AI planning assistant.
- **Experience:** capture the trip *as it happens* — text and **voice notes** on events and the trip.
- **Reflect:** optional, toggleable journaling prompts ("favorite meal?", "favorite part?").
- **Share:** share trips with friends via **link or in-app accounts**, with **real-time co-editing**
  and reactions.
- **Discover:** turn notes into an **AI-generated recap** (per event / day / trip), **export** it,
  and optionally **publish publicly**. Public recaps are **searchable** and power an
  **AI discovery assistant** (RAG) that answers questions about places and surfaces itineraries.

**Audience:** travelers who want to plan, journal, and share — solo-first to start, but the social
and discovery layers make it a community product over time.

- **Architecture:** see [`architecture.md`](./architecture.md)
- **Privacy/consent/moderation:** see [`privacy-consent-moderation.md`](./privacy-consent-moderation.md)
- **Deployment & app stores:** see [`deployment-and-app-stores.md`](./deployment-and-app-stores.md)
- **Mockups:** see [`/mockups`](../mockups)

### Key product decisions (2026-05-30)
| Decision | Choice |
|---|---|
| Direction | **Full platform**: plan, recap, publish, search + AI Q&A |
| Friend sharing | **Both** share-by-link *and* in-app accounts |
| Friend capabilities | **Co-edit** the itinerary + **react**; commenting via shared notes |
| Note capture timing | **Live, during the trip** (offline-capable); reflection prompts at end of day/trip |
| Voice notes | Stored as **audio + transcript** (Azure Speech-to-Text) |
| Recap AI | **Azure OpenAI** summarizes notes → editable recap → export/publish |
| Discovery | **RAG** (retrieval + Azure OpenAI over public recaps); fine-tuning only later |

---

## Guiding principles
1. **Ship vertical slices** — each phase produces something a user can actually do end-to-end.
2. **Quality gates per phase** — no phase is "done" until its testing exit criteria pass.
3. **Privacy & consent are first-class** — sharing/publishing/AI-use are explicit, granular opt-ins.
4. **Low-friction capture** — journaling during a trip must be fast and work **offline**.
5. **AI augments, never blocks** — the app is fully usable without AI; AI accelerates planning & recaps.
6. **Schema-ahead** — model sharing, notes, and consent early so later phases are additive.

---

## Phase overview

| Phase | Name | Outcome | Est. |
|---|---|---|---|
| **0** | Foundation & Setup (Local-first) | Repo, CI/CD, **accounts/auth**, design system, local app shell | ~2 wks |
| **1** | Core Itinerary & Calendar | Create trips, day-by-day plans, calendar (day + multi-day) | ~3–4 wks |
| **2** | Maps & Integrations | Map view, place search, live weather, .ics export | ~3 wks |
| **3** | Deployment & Release Foundations | Azure environments, CI/CD deploy, EAS/store groundwork | ~1–2 wks |
| **4** | Notes & Journaling | Text + **voice notes** (audio+transcript), reflection prompts, offline capture | ~3–4 wks |
| **5** | AI Planning Assistant ✅ | Generate & refine itineraries via chat | ~3 wks |
| **6** | AI Recap & Export ✅ | Summarize notes → recap (event/day/trip), export to PDF/web | ~2–3 wks |
| **7** | Sharing & Collaboration ✅ | Share by link + accounts, **real-time co-edit**, reactions | ~3–4 wks |
| **8** | Public Recaps & Discovery 🔄 | Publish + moderation, search, **RAG** location Q&A + itinerary discovery | ~4–5 wks |
| **9** | Offline, Polish & Launch | Robust sync, performance, accessibility, launch hardening | ~2–3 wks |
| **Later / v2** | Monetization & advanced | Premium tier, booking, fine-tuning exploration | post-launch |

> Estimates assume a small team and are planning aids, not commitments. Offline foundations begin in
> Phase 4 (capture must work offline) and are hardened in Phase 9.

---

## Phase details (summary)

### Phase 0 — Foundation & Setup (Local-first)
- **Goal:** A locally runnable, **authenticated** app shell with CI green.
- **Deliverables:** Expo app, ASP.NET Core API + EF Core, local Postgres baseline, accounts via
  **Microsoft Entra External ID**, design system, CI/CD, base schema (incl. sharing/consent fields).
- **Exit criteria:** A user can sign up, log in, and see an empty "My Trips" on iOS/Android/Web; CI runs
  lint + typecheck + tests on every PR; API enforces per-user ownership.
- **Note:** cloud deployment and app-store work are intentionally deferred to Phase 3.

### Phase 1 — Core Itinerary & Calendar
- **Goal:** Plan a trip manually, end to end.
- **Deliverables:** Trip CRUD, day-by-day itinerary (drag-to-reorder), items (flight/lodging/food/
  activity/transport), packing list & to-dos, calendar (day + **multi-day** + agenda), conflict detection.
- **Exit criteria:** Create a multi-day trip, add/edit/reorder items, view on calendar, warned on overlaps.
- **Status:** largely prototyped on fake data (itinerary, add-activity, calendar day + multi-day).

### Phase 2 — Maps & Integrations
- **Goal:** Make planning spatial and context-aware.
- **Deliverables:** Map of stops + travel time, place search/autocomplete, **live weather**
  (Open-Meteo → Azure Maps; date-based forecast vs. climate normals), `.ics` export + calendar sync.
- **Exit criteria:** Search → pin on map + into itinerary; per-day weather; valid `.ics` export.

### Phase 3 — Deployment & Release Foundations  ✅ **Complete (2026-06-03)**
- **Goal:** Prepare cloud and release infrastructure once core local feature loops are stable.
- **Deliverables:** Azure resource groups/environments (`dev`/`staging`/`prod`), API deployment target
  (App Service), database environment plan, CI/CD deployment stages, EAS build/update setup, and app-store
  groundwork (Apple/Google accounts, bundle/package IDs, signing).
- **Exit criteria:** App deploys from pipeline to at least one Azure environment; first internal mobile
  build path is proven; deployment runbook is documented.
- **Status:** Done — dev environment **live on Azure** (App Service + Postgres + Key Vault + Static Web
  Apps), CI deploys + runs migrations, **web Microsoft Entra sign-in works end-to-end** against the
  deployed API, EAS Build/Update + manual staging/prod deploy wired. Deferred (when-ready/launch):
  actual staging/prod stand-up (cost + CIAM tenants), real EAS cloud builds (needs Expo login),
  native sign-in redirect, store submission, and responsive web/iPad layout. See
  [`phase-3-summary.md`](./phase-3-summary.md).

### Phase 4 — Notes & Journaling  *(capture)*  ✅ **Complete (2026-06-08)**
- **Goal:** Capture the trip as it happens, low-friction and offline.
- **Deliverables:**
  - **Text notes** scoped to an **event**, a **day**, or the **whole trip**.
  - **Voice notes:** record audio (stored in Blob) + **transcribe** (Azure Speech-to-Text); keep both.
  - **Reflection prompts:** preset + custom, **toggleable globally and per trip**; fire at end of
    day/event/trip; optional reminder notifications.
  - **Offline-first capture:** notes & recordings created offline, queued, and synced on reconnect.
  - Attach photos to notes (Blob).
- **Exit criteria:** Create text & voice notes (with transcript) on an event/day/trip offline; they sync;
  prompts can be turned off; media stored securely with ownership checks.
- **Status:** Done on the **web** target (dev) — text/voice/photo journaling, **cloud transcription
  verified end-to-end**, reflection prompts, post-event reminders (global/per-trip/per-type + quiet
  hours), media via ownership-checked streaming + **short-lived SAS**, and **offline-first text/prompt**
  capture (persisted sync outbox). Deferred by decision: on-device native dev-build pass, offline
  **media** resume (→ Phase 9), `functionApp.bicep` Y1→Flex tidy-up, and the remaining
  integration/E2E/privacy tests. See `phases/phase-4-notes-journaling/README.md`.

### Phase 5 — AI Planning Assistant  ✅ **Complete (2026-06-08)**
- **Goal:** Accelerate planning with AI that edits the real trip.
- **Deliverables:** "Generate itinerary" from a prompt; chat assistant with tool-calling (search places,
  add/move items, gap-fill); preference-aware; per-user quotas; batch undo; basic guardrails.
- **Exit criteria:** Prompt → editable draft; chat edits persist; respects preferences & token quotas;
  visible changes + undo.
- **Status:** Done on **dev** — Slices 0–4 shipped (AI seam, preferences, ephemeral draft generation,
  SSE chat + tools, batch undo, input guard + chat rate limit). Azure OpenAI wired on dev App Service.
  Chat + Generate on the **Assistant tab**; trip planner AI dock is placeholder + undo after chat.
  Deferred by decision: in-trip composer, integration tests, golden AI evals, automated E2E, expanded
  safety evals, undo on Generate Apply. See [`phase-5-summary.md`](./phase-5-summary.md) and
  [`phases/phase-5-ai-assistant/README.md`](../phases/phase-5-ai-assistant/README.md).

### Phase 6 — AI Recap & Export  ✅ **Complete (2026-06-12)**
- **Goal:** Turn captured notes into a shareable story.
- **Deliverables:** **Azure OpenAI** summarizes notes (text + transcripts) into a **recap** at event,
  day, and whole-trip levels; tone/format options; user can **edit before saving**; **export** to
  PDF and a shareable web page; optional inclusion of photos.
- **Exit criteria:** Generate an editable trip recap from notes; export a polished PDF/web page; AI recap
  quality passes the eval thresholds; no fabricated facts beyond the user's notes.
- **Status:** Done on **dev** (web) — versioned `Recap` entity + generate/save/finalize API, strict
  grounding (context whitelist + per-section note citations validated server-side), **historical
  weather actuals** (Open-Meteo archive, immutable cache) in recap context, tone picker, QuestPDF
  export + unlisted `/share/recaps/{token}` page, quota + regeneration dedupe. Also shipped the
  deferred Phase 5 **in-trip AI dock** composer. Deferred: golden faithfulness evals, event-scope UI
  entry, photos on the share page, live E2E. See [`phase-6-summary.md`](./phase-6-summary.md).

### Phase 7 — Sharing & Collaboration ✅  *(expanded from old v2)*
- **Goal:** Plan and relive trips together.
- **Deliverables:** Share a trip via **link** (viewer needs no account) and **in-app friends/accounts**;
  roles (owner/editor/viewer); **real-time co-editing** (Azure Web PubSub/SignalR) with presence;
  **reactions**; shared notes act as comments. Conflict handling upgraded for multi-user edits.
- **Exit criteria:** Two users co-edit a trip in real time with correct roles; link sharing works for
  non-users; reactions + shared notes propagate live. **All met.**
- **Closed (2026-07-14):** All 6 slices shipped on dev — `ITripAccessService` access resolution, link
  sharing (anonymous view + redeem), account sharing (invite/roles), self-hosted SignalR co-edit with
  presence, reactions + shared notes as comments (incl. client reactions UI), and **consent
  enforcement** (`ConsentSetting.ShareEnabled` explicit opt-in; disabling it unshares every active
  link/membership immediately). Closed out with a real two-client SignalR integration test
  (`RealtimeE2ETests.cs`, `WebApplicationFactory<Program>` against the real hub) and a full
  Phases 0–6 regression pass: backend **180/180**, Functions **3/3**, app **93/93** + `tsc` clean.
  Operational-merge/CRDT conflict handling is a documented backlog item (last-write-wins + presence
  ships today; not required by the exit criteria). See [`phase-7-summary.md`](./phase-7-summary.md).

### Phase 8 — Public Recaps & Discovery 🔄  *(NEW)*
- **Goal:** A searchable, AI-powered travel knowledge layer from public recaps.
- **Deliverables:**
  - **Publish** a recap publicly (explicit opt-in, per recap), with PII review.
  - **Moderation** pipeline (Azure AI Content Safety + reporting/takedown).
  - **Search** public recaps (by place, activity, season, budget) — keyword + semantic.
  - **RAG discovery assistant:** ask about a location → grounded answer with **citations** to public
    recaps, plus **surfaced itineraries** you can clone. Vector index over consented public content.
- **Exit criteria:** Publish/unpublish with consent; moderation blocks unsafe content; search returns
  relevant recaps; discovery Q&A answers are grounded in and cite public recaps.
- **Progress (2026-07-14):** Slices 0–3 built on dev. **Slice 0:** the safety-critical **post-trip
  gate** (publishing rejected server-side while `today < trip.EndDate`) plus a **consent gate**
  (`ConsentSetting.PublishEnabled`), ahead of a swappable moderation seam. Publish/unpublish
  round-trips, republish revives rather than duplicates, and disabling publish consent cascades an
  immediate unpublish (same pattern as Phase 7's share-revocation). **Slice 1:** the moderation seam
  now has a real implementation — `AzureContentModerationService` (real Azure AI Content Safety,
  selected when configured; the fake reviewer is the dev/CI default) — plus user reporting that pulls
  a recap back to `Pending` immediately and a config-admin-gated review queue to approve/reject. A
  **PII gate** (`RegexPiiDetectionService`) now also sits between consent and moderation: emails/
  phone numbers block publish with a `422` + findings until reviewed or explicitly acknowledged.
  **Slice 2:** search over approved recaps — facet filters (place/tag/season/budget) plus semantic
  ranking against an `EmbeddingChunk` index (real Azure OpenAI embeddings when configured, a
  deterministic fake otherwise), kept in sync on publish/unpublish/approve/reject/report. Vectors are
  a plain `float[]` column with **client-side cosine similarity** rather than a native pgvector
  column — a deliberate simplification (no Postgres extension dependency, identical behavior in
  tests and prod) documented in `architecture.md` §3. **Slice 3:** the RAG discovery assistant
  (`POST /api/discovery/ask`, authed) retrieves via search, applies a relevance floor before ever
  calling the model, then reuses Phase 6's exact grounding discipline (labeled citations, invented
  ones dropped, refuses via `hasAnswer:false` rather than hallucinating). Backend **229/229**. All
  three of Phase 8's core objectives are now backend-complete; open: client UI, recap-delete →
  unpublish cascade. See [`phase-8-summary.md`](./phase-8-summary.md).
- **Discovery approach:** **RAG first** (controllable, current, consent-clean). Fine-tuning is a
  later evaluation, gated on explicit training consent — see the privacy doc.

### Phase 9 — Offline, Polish & Launch
- **Goal:** Reliable in the field; production-ready.
- **Deliverables:** Harden offline sync (incl. media), conflict handling, performance & accessibility
  passes, onboarding, store assets, final security/privacy review.
- **Exit criteria:** Full plan + capture flow works offline and syncs; meets perf & a11y targets; passes
  store + privacy review.

### Later / v2 — Monetization & advanced
- Premium tier (Stripe), booking/affiliate integrations, fine-tuning exploration, advanced analytics.

---

## Cross-cutting workstream — Privacy, Consent & Moderation
Runs across **all** phases (detailed in [`privacy-consent-moderation.md`](./privacy-consent-moderation.md)):
- Granular, revocable consent for **sharing**, **publishing**, and **AI/training use**.
- PII detection/redaction before publishing.
- UGC moderation (automated + reporting + takedown) for public content.
- Data export & deletion (GDPR/CCPA-style), audio/transcript retention policy.

---

## Cross-phase testing strategy

We test continuously, not just at the end. Each phase folder contains a concrete test checklist.

| Layer | Tooling | What it covers | When |
|---|---|---|---|
| **Static** | TypeScript, ESLint, Prettier; .NET analyzers | Types, lint, formatting | Every save / pre-commit |
| **Unit** | Jest + RN Testing Library; xUnit (API) | Pure logic, components, services | Every PR |
| **Integration** | RNTL + MSW; API integration tests vs. test Postgres | Feature flows, data layer, ownership/roles | Every PR |
| **End-to-end** | Maestro (mobile) / Playwright (web) | Critical journeys incl. **multi-user co-edit** | Pre-merge + nightly |
| **AI evals** | Prompt/golden suites | Itinerary quality, **recap faithfulness**, **RAG groundedness/citations**, safety | Phases 5,6,8 on AI changes |
| **Media/voice** | Transcription accuracy samples; audio upload/playback | Voice notes, transcripts, Blob round-trip | Phase 4+ |
| **Moderation/privacy** | Content-safety test corpus; consent-state tests; PII redaction | Public UGC, consent gates, deletion/export | Phase 8 + regression |
| **Manual / exploratory** | Device matrix, internal track | UX, real-device quirks, **offline capture** | End of each phase |
| **Non-functional** | Lighthouse, perf profiling, axe a11y | Performance, accessibility, bundle size | Phase 9 + regression |

**Definition of Done (every feature):**
- Code reviewed and merged via PR with green CI.
- Unit + integration tests added/updated and passing.
- Critical-path E2E covered (where applicable).
- Works on iOS, Android, and Web.
- Accessible and handles loading/empty/error states.
- **Privacy/consent respected** (no data shared/published/used by AI without opt-in).
- No new error-budget regressions in staging.

**Quality gates between phases:** a phase cannot start until the prior phase's exit criteria and test
checklist are signed off.

---

## Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Privacy/consent for public + AI/RAG** | High | Explicit, granular, revocable consent; PII redaction; consent-state in every query; see privacy doc |
| **UGC moderation at scale** | High | Azure AI Content Safety + reporting/takedown + human review queue |
| **Real-time co-edit conflicts** | High | Presence + operational merge; evaluate CRDTs; isolate sync behind an interface |
| **AI cost (transcription + LLM + embeddings)** | Med-High | Quotas, caching, batch embedding, cheaper models for drafts, cost dashboards |
| **Media storage/egress cost** | Med | Compress audio, lifecycle policies, signed URLs, size caps |
| **RAG answer quality / hallucination** | Med | Grounded answers with citations, groundedness evals, "no good source" fallback |
| **Offline capture reliability** | Med | Outbox + local media cache; sync tests; never lose a recording |
| **Scope (full platform is large)** | High | Strict phase gating; capture→recap before social/public; feature flags |

---

## Milestones
- **M1:** Authenticated app shell on all platforms (end of Phase 0) ✅
- **M2:** Manual planning end-to-end (end of Phase 1) ✅
- **M3:** Map + live weather + integrations (end of Phase 2) ✅
- **M4:** Deployment/release foundations in place (end of Phase 3) ✅
- **M5:** Notes & voice journaling, offline (end of Phase 4) ✅
- **M6:** AI planning assistant usable (end of Phase 5) ✅
- **M7:** AI recap + export (end of Phase 6) ✅
- **M8:** Sharing + real-time collaboration (end of Phase 7) ✅ *All 6 slices shipped and closed out
  with a live two-client realtime test + full regression pass (backend 180/180, app 93/93).*
- **M9:** Public discovery + RAG Q&A (end of Phase 8) 🔄 *Slices 0–3 shipped: post-trip + consent
  publish gate, real Azure Content Safety moderation, reporting → review queue, PII detection gate,
  search (facets + semantic ranking), and a grounded RAG discovery assistant with citations — all
  backend-complete; client UI still open.*
- **M10:** Public launch — offline, polished, privacy-reviewed (end of Phase 9)
