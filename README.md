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
│  └─ Wander.Api/           ← controllers, models, seeded in-memory data
├─ app/                     ← Expo (React Native + Web) client
│  └─ src/                  ← screens, components, api client, theme
└─ phases/                  ← one folder per delivery phase, each with tasks + tests
   ├─ phase-0-foundation/  …  phase-2.5-deployment-release-foundations/  …  phase-8-offline-polish-launch/
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
- **Working now (Phase 0 local-first baseline):** API is PostgreSQL-backed through EF Core (with migration),
  ownership checks are enforced per user, Entra JWT validation + dev bypass are wired, and local startup scripts
  boot API + Expo together. The client uses TanStack Query + Zustand, Expo Router entrypoint, Entra auth-session
  sign-in/sign-out scaffolding (with persisted token session), and includes Jest/RNTL plus Playwright smoke test scaffolding.
- **Phase 1 (in progress) — Trip CRUD + My Trips list:** Users can **create, edit, and delete trips**
  (API-backed, owner-enforced, with field validation), and the **My Trips** list now supports **search**
  (title/destination), **sort** (date / name), **upcoming vs. past grouping**, and loading/empty/error states.
  Mutations update the TanStack Query cache and invalidate the trips list. See
  [`phases/phase-1-core-itinerary`](./phases/phase-1-core-itinerary) for the full progress log and local checklist.
- **Prototype UX still present for feature scope:** Trip itinerary (timeline + weather + costs),
  Add Activity, Calendar (day + **multi-day** views), Profile with °F/°C unit toggle, tab navigation.
  Full inventory: [`phases/phase-minus-1-prototype`](./phases/phase-minus-1-prototype).
- **Before building for real:** see the [pre-build checklist](./docs/pre-build-checklist.md)
  (decisions to lock, Azure/Entra/OpenAI provisioning, local Postgres, CI).
- **Next:** continue Phase 1 (itinerary builder with drag-to-reorder, planner shell, calendar, conflict
  detection); deployment/app-store work is deferred to **Phase 2.5**.

## What's next & handoff (read this if you're the next agent)

**Where we are:** the [Phase −1 prototype](./phases/phase-minus-1-prototype) is done (fake data, no
infra). Planning docs are current.

**What to start with — Phase 0 (Foundation & Setup):**
1. First clear the local-first critical path in the [pre-build checklist](./docs/pre-build-checklist.md) —
   get the API/client running against **local Postgres**, keep Entra wired for auth flow, and track Azure/OpenAI
   provisioning in parallel.
2. Then do the Phase 0 entry work: add **EF Core + Npgsql**, create the first **migration** for the
   base schema (incl. `consent_settings` + sharing fields), swap
   `InMemoryTripRepository` → an EF Core repository behind the existing `ITripRepository`, wire
   **Entra JWT auth** (replace the `DemoOwner` constant), lock down CORS, and stand up **CI**.
3. Follow the tasks/exit criteria in [`phases/phase-0-foundation`](./phases/phase-0-foundation).

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

| Phase | Focus |
|---|---|
| 0 | Foundation & setup (local-first: repo, CI/CD, **accounts/auth**, design system) |
| 1 | Core itinerary & calendar (manual planning, end-to-end) |
| 2 | Maps & integrations (places, weather, .ics) |
| 2.5 | Deployment & release foundations (Azure envs, CI/CD deploy, EAS/store setup) |
| 3 | AI planning assistant (generate & refine itineraries) |
| 4 | Notes & journaling (text + **voice notes**, reflection prompts, offline) |
| 5 | AI recap & export (notes → recap, PDF/web) |
| 6 | Sharing & collaboration (link + accounts, **real-time co-edit**, reactions) |
| 7 | Public recaps & discovery (publish + moderation, search, **RAG** Q&A) |
| 8 | Offline, polish & launch (sync, performance, a11y, privacy review) |
| Later / v2 | Monetization & advanced (premium, booking, fine-tuning) |

See [`docs/project-plan.md`](./docs/project-plan.md) for the full breakdown and testing strategy.
