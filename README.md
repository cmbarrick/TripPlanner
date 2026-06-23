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

**Phases 0–6 are complete on the dev environment** (web target). The app runs end-to-end on Azure dev:
plan a trip → capture it with notes → turn notes into an AI recap. Test health at last close: backend
**152/152**, app **93/93**, `tsc` clean. See the per-phase summaries in [`/docs`](./docs).

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
- **Consistent dev-only posture:** everything ships on **dev (web)**. Recurring deferred items: golden
  AI evals, live integration/E2E, staging/prod stand-up, native mobile build/sign-in, and offline
  **media** sync (→ Phase 9).
- **Next:** **Phase 7 — Sharing & Collaboration** (share by link + accounts, real-time co-edit,
  reactions). See [`phases/phase-7-sharing-collaboration`](./phases/phase-7-sharing-collaboration).

## What's next & handoff (read this if you're the next agent)

**Where we are:** Phases 0–6 are closed on dev (web). The full **Plan → Capture → Recap** loop works
end-to-end on Azure dev. Planning docs and per-phase summaries in [`/docs`](./docs) are current.

**What to start with — Phase 7 (Sharing & Collaboration):**
1. Read [`phases/phase-7-sharing-collaboration`](./phases/phase-7-sharing-collaboration) for goals,
   tasks, and exit criteria.
2. Build outward from the existing sharing/consent schema and the Phase 6 recap **share-token**
   capability pattern (a single-recap preview of the Phase 7 link-capability model):
   - **Share by link:** capability tokens with `viewer`/`editor` roles, expiry, and revoke.
   - **Share by account:** invite friends; `TripMember` with **owner / editor / viewer** roles.
   - **Real-time co-edit:** Azure Web PubSub / SignalR for presence + live itinerary updates.
   - **Conflict handling:** move beyond last-write-wins toward operational merge.
   - **Reactions** + **shared notes as comments** (reuse Phase 4 notes within shared trips).
3. Honor the consent model: sharing is explicit opt-in; revocation unshares immediately.

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
| 7 | Sharing & collaboration (link + accounts, **real-time co-edit**, reactions) | ⬜ Next |
| 8 | Public recaps & discovery (publish + moderation, search, **RAG** Q&A) | ⬜ Pending |
| 9 | Offline, polish & launch (sync, performance, a11y, privacy review) | ⬜ Pending |
| Later / v2 | Monetization & advanced (premium, booking, fine-tuning) | ⬜ Pending |

See [`docs/project-plan.md`](./docs/project-plan.md) for the full breakdown and testing strategy.
