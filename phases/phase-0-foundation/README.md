# Phase 0 — Foundation & Setup (Local-first)

> Goal: A locally runnable, **authenticated** app shell with CI green.
> Est: ~2 weeks · Depends on: nothing

## Objectives
- Stand up the cross-platform Expo client and the ASP.NET Core API.
- Establish **accounts/auth**, the design system, and the base data schema
  (**including sharing & consent fields** so later phases are additive).
- Make CI/CD enforce quality from day one.

> Accounts move into Phase 0 (vs. later) because sharing, publishing, and consent all depend on identity.

## Scope / tasks
- [x] Initialize Expo (React Native + Web) app in TypeScript with Expo Router.
- [x] Set up the design system (Tamagui/NativeWind): theme, colors, typography, base components.
- [x] Scaffold **ASP.NET Core (.NET 9) + EF Core (Npgsql)** API; Swagger in dev.
- [x] Provision local PostgreSQL baseline for all devs (cloud DB deferred to Phase 2.5).
- [x] Implement auth via **Microsoft Entra External ID** (email + Google/Apple); API validates JWT.
- [x] Define base schema: `users`, `preferences`, **`consent_settings`**, `trips`, `days`,
      `itinerary_items`, `packing_items`, **`trip_members` / `trip_shares` (sharing-ready)**,
      plus `created_at/updated_at/deleted_at`.
- [x] Enforce **per-user ownership** checks in the API/service layer.
- [x] Set up state libs: TanStack Query + Zustand; query persistence scaffold.
- [x] Configure CI (GitHub Actions / Azure DevOps): install, lint, typecheck, unit tests, `dotnet ef` migrations.
- [x] Create local auth + config bootstrap docs/scripts (no Azure deploy yet).
- [x] Wire up Application Insights (API) + Sentry (client) + basic analytics.
- [x] App shell: navigation + empty "My Trips" + profile screen.

## Out of scope
- Any real trip-building features (Phase 1).
- Cloud deployment, app store delivery, and staging/production environments (moved to Phase 2.5).

## Testing plan
- [ ] **Static:** TS/ESLint/Prettier + .NET analyzers pass; pre-commit hook configured.
- [x] **Unit:** auth helpers, theme/provider, route guards; API service unit tests.
- [ ] **Integration:** sign-up / login / logout; API **ownership** denies access to another user's row.
- [ ] **E2E (smoke):** launch → sign up → land on empty My Trips, on web (Playwright) + mobile (Maestro).
- [ ] **Manual:** install on a real iOS + Android device; verify OAuth round-trip.

## Exit criteria
- A new user can sign up, log in, and see an empty "My Trips" on **all three platforms**.
- CI is green on every PR (lint + typecheck + unit + smoke E2E); migrations run in the pipeline.
- Local run is one-command for API + client, with documented local auth and Postgres setup.
- Ownership verified: users cannot read others' data.

## Artifacts
- Mockups: `../../mockups` (Onboarding / Sign-in, empty My Trips)
- Local validation checklist: `../../docs/phase-0-local-test-plan.md`

## Progress log
- **2026-05-30 (agent):** Added EF Core + Npgsql + first migration (`InitialFoundationSchema`) for
  `users`, `preferences`, `consent_settings`, `trips`, `days`, `itinerary_items`, `packing_items`,
  `trip_members`, and `trip_shares`, including audit + soft-delete fields.
- **2026-05-30 (agent):** Replaced `InMemoryTripRepository` DI with `EfCoreTripRepository` while
  keeping the `ITripRepository` seam; ownership now flows through repository methods to enforce
  per-user access on trip and itinerary operations.
- **2026-05-30 (agent):** Wired JWT bearer auth for Entra External ID, removed hardcoded demo owner
  usage from `TripsController`, hardened CORS to configured origins, and added a baseline CI workflow
  with backend build/test, app lint/typecheck/test, and a `dotnet ef migrations script` check.
- **2026-05-30 (agent):** Added a development-only local auth bypass (config-gated) so the API/client
  can run end-to-end locally before Entra provider federation is finalized, plus `docs/local-auth-dev-setup.md`
  with local run + Entra/Google/Apple setup steps.
- **2026-05-30 (agent):** Added local startup shortcuts: `scripts/start-local.ps1` to launch API + app
  in separate PowerShell windows, and `scripts/stop-local.ps1` to stop both using tracked PIDs.
- **2026-05-30 (agent):** Added root double-click launchers `start-wander.cmd` / `stop-wander.cmd`
  so local startup/shutdown works without terminal command typing.
- **2026-05-30 (decision):** Deployment and app-store work moved from Phase 0 to a new Phase 2.5;
  Phase 0 remains local-first until feature work through Phase 2 stabilizes.
- **2026-05-30 (agent):** Added `docs/phase-0-local-test-plan.md` to verify startup, DB/migrations,
  local auth/ownership isolation, CORS, CI-equivalent checks, and launcher reliability.
- **2026-05-30 (agent):** Added app state baseline with TanStack Query + Zustand (`App.tsx`,
  `src/queries/trips.ts`, `src/store/uiStore.ts`), widened local dev CORS for localhost ports,
  and added development Postgres seeding for the local dev user.
- **2026-05-30 (agent):** Added first backend ownership test scaffolding via new xUnit project
  `backend/Wander.Api.Tests` with `InMemoryTripRepository` ownership tests, and included it in
  `backend/Wander.sln` so CI `dotnet test` executes it.
- **2026-05-30 (agent):** Added frontend test scaffolding with Jest + React Native Testing Library
  (`app/jest.config.js`, `app/jest.setup.ts`, `app/App.test.tsx`) and updated app `test` script to
  run Jest smoke tests in CI/local.
- **2026-05-30 (agent):** Added Expo Router baseline (`app/app/_layout.tsx`, `app/app/index.tsx`,
  `expo-router/entry` main entry, and Babel config updates) while preserving the existing app shell.
- **2026-05-30 (agent):** Wired observability baseline: conditional backend Application Insights
  startup (`ApplicationInsights:ConnectionString`) and client telemetry init scaffold keyed off
  `EXPO_PUBLIC_SENTRY_DSN`; added Playwright web smoke E2E scaffolding (`playwright.config.ts`,
  `e2e/smoke.spec.ts`, `npm run test:e2e:smoke`).
- **2026-05-30 (agent):** Implemented client auth session flow scaffold with Expo AuthSession +
  SecureStore: Profile sign-in/sign-out actions, persisted Entra token session, and automatic
  `Authorization: Bearer` headers for API calls when signed in (falls back to dev bypass header).
- **Deferred / blocked:** Azure subscription/resource groups, Entra tenant provisioning, Azure OpenAI
  access request, and Apple/Google developer enrollment + bundle reservation remain pending and are
  tracked for Phase 2.5 deployment readiness.
- **Open setup item:** local Postgres credentials in checked-in config are placeholders and must be
  provided via user-secrets/environment values before running migrations against your own instance.
