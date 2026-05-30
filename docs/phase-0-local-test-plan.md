# Phase 0 Local Test Plan (Completed Work)

Use this checklist to verify what is already implemented in Phase 0 local-first foundation work.

## Preconditions
- Local PostgreSQL running on `localhost:5432`
- Backend user-secrets set for `ConnectionStrings:DefaultConnection`
- Playwright browser installed once via `npx --prefix app playwright install chromium`
- From repo root, start services with:
  - `.\start-wander.cmd`

## 1) Startup and health
- [ ] `start-wander.cmd` opens two PowerShell windows (API + app) without path/command errors.
- [ ] API health returns OK at `http://localhost:5064/health`.
- [ ] Expo web opens and loads the app UI.

## 2) Database and migration checks
- [ ] Run `dotnet ef migrations script --project backend/Wander.Api/Wander.Api.csproj --startup-project backend/Wander.Api/Wander.Api.csproj --idempotent`.
- [ ] Confirm the migration includes core Phase 0 tables: `Trips`, `Days`, `ItineraryItems`, `Users`,
      `Preferences`, `consent_settings`, `trip_members`, `trip_shares`, `packing_items`.
- [ ] Stop and restart services; confirm data still loads (no schema/startup exceptions).

## 3) Local auth behavior (dev bypass)
- [ ] With default local setup, `/api/trips` returns authenticated data (not 401).
- [ ] Set `EXPO_PUBLIC_DEV_USER_ID` to a second value and restart app window.
- [ ] Confirm user A data is not visible as user B (ownership isolation).

## 3b) Entra auth session behavior (optional once tenant exists)
- [ ] Set `EXPO_PUBLIC_AUTH_ISSUER` + `EXPO_PUBLIC_AUTH_CLIENT_ID` in app shell.
- [ ] In API dev config, set `Authentication:DevBypass:Enabled=false`.
- [ ] From Profile screen, complete **Sign in**.
- [ ] Confirm API requests succeed with bearer auth and no `X-Dev-User-Id` dependency.
- [ ] Use **Sign out** and verify protected calls are no longer authenticated.

## 4) API ownership enforcement
- [ ] Create a trip as user A.
- [ ] Switch to user B and confirm:
  - [ ] GET by user A trip id returns not found/denied behavior.
  - [ ] Update/delete of user A trip does not succeed.
- [ ] Switch back to user A and confirm trip remains intact.

## 5) Repository seam and CRUD sanity
- [ ] GET trips works through the existing `ITripRepository` seam.
- [ ] Add/update/delete trip works end-to-end.
- [ ] Add/delete itinerary item works end-to-end.
- [ ] Restart API and confirm persisted records remain.

## 6) CORS and local client connectivity
- [ ] Web client at `http://localhost:8081` can call API successfully.
- [ ] Unknown origin requests are blocked when not in allowed origins config.

## 7) CI-equivalent local checks
- [ ] Backend build: `dotnet build backend/Wander.sln -c Release`.
- [ ] Backend tests: `dotnet test backend/Wander.sln -c Release`.
- [ ] App checks:
  - [ ] `npm --prefix app run lint`
  - [ ] `npm --prefix app run typecheck`
  - [ ] `npm --prefix app run test`
  - [ ] `npm --prefix app run test:e2e:smoke` (Playwright web smoke)

## 8) Launcher reliability
- [ ] `.\stop-wander.cmd` cleanly stops both windows/processes.
- [ ] Running `.\start-wander.cmd` again after stop works consistently.

## Expected result
- Local run is stable, DB-backed, auth/ownership-safe, and repeatable without Azure deployment.

## Phase 1 onward
- Feature-level local verification now lives in [`phase-1-local-checklist.md`](./phase-1-local-checklist.md)
  (starting with Trip CRUD + My Trips search/sort/grouping). The Phase 0 checks above remain the
  foundation/regression baseline.
