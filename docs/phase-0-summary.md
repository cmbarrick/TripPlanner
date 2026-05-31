# Phase 0 Summary — Foundation & Setup (Local-first)

Date: 2026-05-30  
Status: In-repo Phase 0 engineering baseline complete; external/manual setup items tracked.

## Outcome

Phase 0 established a local-first foundation so development can proceed without waiting on Azure deployment:

- API runs on ASP.NET Core (.NET 9) with EF Core + PostgreSQL persistence.
- Ownership and auth seams are in place (Entra JWT validation + development bypass + client auth session scaffold).
- CI and core test scaffolding are active (backend tests, app tests, web smoke E2E).
- Local startup/shutdown and verification paths are documented and scripted.

## What Was Completed

### Backend foundation
- Added EF Core + Npgsql with first migration and schema for:
  - `users`, `preferences`, `consent_settings`, `trips`, `days`, `itinerary_items`, `packing_items`, `trip_members`, `trip_shares`
- Replaced in-memory trip persistence with `EfCoreTripRepository` behind `ITripRepository`.
- Enforced owner-based access checks through controller + repository flow.
- Enabled DB migrations + dev seed data at startup in development.

### Auth and security
- Wired Entra JWT validation in API.
- Removed hardcoded demo owner behavior from trip access paths.
- Added development-only header bypass (`X-Dev-User-Id`) for local unblock.
- Added client auth-session scaffold (Expo AuthSession + SecureStore):
  - Sign in / sign out entry points in Profile
  - Persisted local session
  - Automatic `Authorization: Bearer` header when token exists
- Hardened CORS for non-dev and localhost-friendly development behavior.

### Client and app shell
- Added TanStack Query + Zustand baseline state architecture.
- Added Expo Router baseline entry + routing layout scaffold.
- Kept Phase -1 trip/calendar shell functional while moving data path to API-first.

### Observability and quality
- Added Application Insights baseline wiring (API).
- Added client observability initialization scaffold for Sentry DSN.
- Added/validated CI checks for build, lint/typecheck, tests, and migration script generation.

### Testing and developer experience
- Added backend xUnit test project and ownership-oriented tests.
- Added frontend Jest + React Native Testing Library smoke test.
- Added Playwright web smoke E2E and verified it passes locally.
- Added/updated local scripts and docs:
  - `start-wander.cmd` / `stop-wander.cmd`
  - `scripts/start-local.ps1` / `scripts/stop-local.ps1`
  - `docs/local-auth-dev-setup.md`
  - `docs/phase-0-local-test-plan.md`

## Locked Decisions

- Database: PostgreSQL
- API hosting direction: Azure App Service (execution deferred to Phase 3)
- Vector strategy: `pgvector` first, Azure AI Search as scale-up option
- Delivery approach: local-first through Phase 2, deployment/release infra in Phase 3

## Remaining Items (Outside Core In-Repo Build)

These are tracked but mostly external/manual:

- Entra tenant/provider provisioning (Google/Apple federation in tenant)
- Azure resource groups/environment provisioning
- Azure OpenAI access request/approval
- Key Vault environment wiring
- Real-device OAuth roundtrip validation (iOS/Android)
- Apple/Google developer account enrollment and store setup

## Recommended Starting Point for Phase 1

Begin with the smallest vertical slice that produces visible value and exercises API + UI flow:

1. Trip CRUD endpoints (create/update/delete hardening where needed)
2. My Trips list search/sort + upcoming/past grouping
3. Integration tests for trip CRUD persistence + ownership enforcement

## Reference Documents

- `phases/phase-0-foundation/README.md`
- `docs/pre-build-checklist.md`
- `docs/phase-0-local-test-plan.md`
- `docs/local-auth-dev-setup.md`
- `phases/phase-1-core-itinerary/README.md`
