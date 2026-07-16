# Wander — Trip Planning App

A cross-platform (iOS / Android / Web) travel app built around the full lifecycle:
**Plan → Experience → Reflect → Share → Discover.** Plan a trip on a map & calendar with an AI
assistant, capture it live with **text & voice notes**, turn notes into an **AI recap**, **share &
co-edit** with friends, and **publish public recaps** that power **AI-driven discovery** of places
and itineraries — all with **offline** capture and **privacy-first** consent.

> This repository contains the **planning artifacts** (plan, architecture, mockups) **and a
> runnable first build**: a .NET API serving seeded fake data and an Expo app that consumes it.

## Repository structure

```
Trip planning App/
├─ README.md                ← you are here
├─ docs/
│  ├─ project-plan.md                  ← phased plan, milestones, testing strategy
│  ├─ architecture.md                  ← tech stack & architecture decisions (ADR)
│  ├─ pre-build-checklist.md           ← "definition of ready" before Phase 0
│  ├─ deployment-and-app-stores.md     ← iOS/Android/web publishing playbook
│  └─ privacy-consent-moderation.md    ← consent model, PII, UGC moderation, data rights
├─ mockups/                 ← static HTML/CSS UI mockups (open index.html)
├─ backend/                 ← ASP.NET Core Web API (.NET 9)
│  └─ Wander.Api/           ← controllers, models, EF Core + PostgreSQL, seed data
├─ app/                     ← Expo (React Native + Web) client
│  └─ src/                  ← screens, components, api client, theme
└─ phases/                  ← one folder per delivery phase, each with tasks + tests
   ├─ phase-0-foundation/  …  phase-3-deployment-release-foundations/  …  phase-9-offline-polish-launch/
```

## Run it locally

The app talks to the API and supports a local-first development flow.
For the full Phase 0 baseline, run local PostgreSQL first, then start API + app.

**1. Backend API (.NET 9)**

```bash
cd backend
dotnet run --project Wander.Api --launch-profile http
```
- API: `http://localhost:5064`  ·  Health: `http://localhost:5064/health`  ·  Trips: `http://localhost:5064/api/trips`
- Data is persisted in PostgreSQL via EF Core migrations and development seed data.

**2. Frontend app (Expo)**

```bash
cd app
npm install        # first time only
npm run web        # opens http://localhost:8081 (or: npm run android / npm run ios)
```

> The client auto-detects the API at `localhost:5064` (Android emulator uses `10.0.2.2`).
> Override with the `EXPO_PUBLIC_API_URL` env var if needed.

**One-command local start/stop (Windows):**
- `.\start-wander.cmd`
- `.\stop-wander.cmd`

### Current status

**Phases 0–8 are complete**, on the dev environment (web target). The app runs end-to-end on Azure
dev: plan a trip → capture it with notes → turn notes into an AI recap → share & co-edit it with
friends in real time → publish a recap publicly after the trip ends, PII-reviewed and moderated by
real Azure AI Content Safety with a reportable/reviewable queue → find it via search or ask a
grounded, cited RAG assistant about it, all from the client's new **Discover** tab and publish sheet.
Test health at last close: backend **231/231**, Functions **3/3**, app **97/97** + `tsc` clean. See
the per-phase summaries in [`/docs`](./docs).

- **Phase 0 — Foundation (local-first):** PostgreSQL-backed API via EF Core (migrations), per-user
  ownership enforcement, Entra JWT validation + dev bypass, CI (lint/typecheck/tests), and local
  start/stop scripts. Client on TanStack Query + Zustand + Expo Router with Entra sign-in/sign-out.
- **Phase 1 — Core itinerary & calendar:** Trip CRUD, **My Trips** (search/sort/grouping), a unified
  **Trip Planner** (`List | Split | Map` × `Day | Trip`) with itinerary items (add/edit/delete, reorder,
  move across days), packing list, conflict detection, cost rollup, and a **Calendar** (day/week/agenda).
- **Phase 2 — Maps & integrations:** Map of stops + travel time, place search/autocomplete, live
  weather, and `.ics` export.
- **Phase 3 — Deployment & release foundations:** Dev environment **live on Azure** (App Service +
  Postgres + Key Vault + Static Web Apps); CI deploys + runs migrations; **web Entra sign-in works
  end-to-end** against the deployed API; EAS Build/Update wired. See [`phase-3-summary.md`](./docs/phase-3-summary.md).
- **Phase 4 — Notes & journaling:** Text/voice/photo journaling scoped to event/day/trip, **cloud
  transcription verified end-to-end**, reflection prompts + reminders, media via ownership-checked
  streaming + short-lived SAS, and **offline-first** text/prompt capture. See [`phase-4-summary.md`](./docs/phase-4-summary.md).
- **Phase 5 — AI planning assistant:** "Generate itinerary" + SSE chat assistant with tool-calling
  (search places, add/move items, gap-fill), preference-aware, per-user token quotas, batch undo,
  input guard + rate limit. Azure OpenAI on dev. See [`phase-5-summary.md`](./docs/phase-5-summary.md).
- **Phase 6 — AI recap & export:** Grounded, versioned recaps (trip/day/event) from notes + transcripts
  with per-section citations + historical weather actuals; tone picker; **PDF export** (QuestPDF) and an
  unlisted `/share/recaps/{token}` page; in-trip AI dock composer. See [`phase-6-summary.md`](./docs/phase-6-summary.md).
- **Phase 7 — Sharing & collaboration:** Share a trip by **link** (anonymous view) or **in-app
  account** (owner/editor/viewer roles); **real-time co-edit** via self-hosted SignalR with presence,
  verified with a live two-client integration test; **reactions** (client UI on trips/items/recaps) +
  **shared notes as comments**; and **consent enforcement** — sharing is explicit opt-in, and turning
  it off unshares every active link/membership immediately. See
  [`phase-7-summary.md`](./docs/phase-7-summary.md).
- **Phase 8 — Public recaps & discovery:** The safety-critical **post-trip publish gate** (a recap
  can't go public until after the trip ends, API-enforced, with a client lock explanation until
  then) plus a **consent gate** (`ConsentSetting.PublishEnabled`), a **PII gate** (emails/phone
  numbers block publish with the findings until reviewed or acknowledged), moderated by real
  **Azure AI Content Safety** (config-selected; a fake reviewer is the dev/CI default). Any user can
  **report** a published recap from the client's **Discover** tab, which pulls it from discovery
  immediately; an admin-gated **review queue** screen approves/rejects. Approved recaps are
  **searchable** (facet + free-text **semantic ranking**) and queryable via a **RAG discovery
  assistant** that answers with citations and refuses (rather than hallucinating) when nothing in
  the corpus actually answers the question — both live in the Discover tab's Search/Ask AI modes.
  Publish/unpublish/republish work end-to-end (including on recap delete), and disabling publish
  consent unpublishes everything immediately. See
  [`phase-8-summary.md`](./docs/phase-8-summary.md).
- **Consistent dev-only posture:** everything ships on **dev (web)**. Recurring deferred items: golden
  AI evals, live integration/E2E (now started with Phase 7's realtime test), staging/prod stand-up,
  native mobile build/sign-in, and offline **media** sync (→ Phase 9).
- **Next:** Phase 9 — Offline, Polish & Launch. See
  [`phases/phase-9-offline-polish-launch`](./phases/phase-9-offline-polish-launch).

## What's next & handoff (read this if you're the next agent)

**Where we are:** Phases 0–8 are closed on dev (web). **Phase 8 (Public Recaps & Discovery)** is
fully done, backend and client: post-trip + consent publish gate; a PII gate for emails/phone
numbers; real Azure AI Content Safety moderation with a fake-by-default seam; user reporting →
admin review queue; search with facet filters + semantic ranking; a grounded RAG discovery
assistant with citations; recap-delete → unpublish cascade; and client UI (`PublishRecapSheet`, a
**Discover** tab for search + RAG Q&A, an admin `ModerationQueueScreen`) — hand-verified live in a
browser against a running dev API. Planning docs and per-phase summaries in [`/docs`](./docs) are
current, including [`phase-8-summary.md`](./docs/phase-8-summary.md).

**What to continue — Phase 9 (Offline, Polish & Launch):**
1. Read [`phases/phase-9-offline-polish-launch`](./phases/phase-9-offline-polish-launch) for the
   phase plan.
2. Harden offline sync, including **media** (audio/photo) resume — deferred since Phase 4; today
   only text/prompt capture is offline-first.
3. Conflict handling: Phase 7 shipped last-write-wins + presence; operational-merge/CRDT handling
   is a documented backlog item.
4. Performance & accessibility passes, onboarding, store assets, final security/privacy review.
5. Backlog, pick up opportunistically: PII detection for names/addresses/faces (needs a real NLP
   provider — regex only covers emails/phones today), location coarsening on public recaps, an async
   indexing job (indexing runs synchronously on publish/approve today), a golden RAG eval corpus
   against a real model, a "clone this itinerary" action from discovery citations, native mobile
   layout pass on Phase 8's new screens (verified on web only so far).

**Working agreement — document as you go.** Before ending your session:
- [ ] **Tick off completed tasks** in the relevant `phases/phase-*/README.md` (check the boxes).
- [ ] Add a short **"Progress log"** entry to that phase's README: what you did, key decisions, and
      anything deferred or still broken.
- [ ] Update **this README's "Current status"** if the working build changed.
- [ ] Record any new architecture/decision in [`docs/architecture.md`](./docs/architecture.md) and
      resolve open items in the [pre-build checklist](./docs/pre-build-checklist.md).
- [ ] End your message with a clear **"Next:"** line stating what the following agent should start with.

## Quick start (review the plan)
1. Read the [project plan](./docs/project-plan.md) for phases, milestones, and the testing strategy.
2. Read the [architecture decisions](./docs/architecture.md) for the tech stack and trade-offs.
3. Open [`mockups/index.html`](./mockups/index.html) in a browser to see the screens.
4. Browse [`phases/`](./phases) — each folder has goals, tasks, a test checklist, and exit criteria.

## At a glance

| Area | Decision |
|---|---|
| Platforms | iOS, Android, Web — one Expo (React Native + Web) codebase |
| Backend | ASP.NET Core (.NET 9) + EF Core API on Azure |
| Database | Azure Database for PostgreSQL (Flexible Server) |
| Auth | Microsoft Entra External ID (accounts from day one) |
| AI | Azure OpenAI — planning assistant, recaps, and RAG discovery |
| Voice | Azure Speech-to-Text (store audio + transcript) |
| Media / secrets | Azure Blob Storage · Azure Key Vault |
| Realtime | Azure Web PubSub / SignalR (live co-editing) |
| Offline | Local-first SQLite + background sync (incl. media) |
| Privacy | Granular, revocable consent for share / publish / AI use |

## Phases

| Phase | Focus | Status |
|---|---|---|
| 0 | Foundation & setup (local-first: repo, CI/CD, **accounts/auth**, design system) | ✅ Complete |
| 1 | Core itinerary & calendar (manual planning, end-to-end) | ✅ Complete |
| 2 | Maps & integrations (places, weather, .ics) | ✅ Complete |
| 3 | Deployment & release foundations (Azure envs, CI/CD deploy, EAS/store setup) | ✅ Complete |
| 4 | Notes & journaling (text + **voice notes**, reflection prompts, offline) | ✅ Complete |
| 5 | AI planning assistant (generate & refine itineraries) | ✅ Complete |
| 6 | AI recap & export (notes → recap, PDF/web) | ✅ Complete |
| 7 | Sharing & collaboration (link + accounts, **real-time co-edit**, reactions) | ✅ Complete |
| 8 | Public recaps & discovery (publish + moderation, search, **RAG** Q&A) | 🔄 In progress |
| 9 | Offline, polish & launch (sync, performance, a11y, privacy review) | ⬜ Pending |
| Later / v2 | Monetization & advanced (premium, booking, fine-tuning) | ⬜ Pending |

See [`docs/project-plan.md`](./docs/project-plan.md) for the full breakdown and testing strategy.
