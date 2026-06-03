# Phase 3 — Deployment & Release Foundations

> Goal: Move from local-first development to repeatable cloud/stores release infrastructure.
> Est: ~1–2 weeks · Depends on: Phase 2
> **Status: Complete (2026-06-03).** All exit criteria met. Actual staging/prod stand-up, real
> EAS cloud builds, and store submission are intentionally when-ready/launch-phase items — see
> the [phase summary](../../docs/phase-3-summary.md).

## Objectives
- Stand up Azure deployment targets and environment topology.
- Prove CI/CD deployment flow for backend and web.
- Establish mobile release plumbing (EAS + store prerequisites), without full public launch yet.

## Scope / tasks
- [x] Create Azure resource groups for `dev` / `staging` / `prod`. _(Bicep `infra/main.bicep`, one RG per env.)_
- [x] Provision API hosting target (locked: **Azure App Service**) and deploy from CI.
      _Linux App Service (.NET 9) in `appService.bicep`; `deploy-dev` job zip-deploys from CI._
- [x] Set up cloud PostgreSQL environments and migration strategy.
      _Flexible Server per env; migrations applied by the pipeline (`dotnet ef database update`),
      startup-migrate gated behind `Database:MigrateOnStartup`._
- [x] Configure web deployment target and pipeline stage.
      _Static Web Apps (`staticWebApp.bicep`); `deploy-web` job exports Expo web and uploads it._
- [x] Configure EAS Build/Update for internal mobile builds.
      _`app/eas.json` (development/preview/production profiles + channels), `expo-updates` installed,
      `runtimeVersion: fingerprint`; `mobile-update` CI job publishes OTA updates (gated by
      `DEPLOY_MOBILE` + `EXPO_TOKEN`). Running a real cloud build needs `eas login`/`eas init`._
- [x] Complete store groundwork: bundle IDs/package IDs set (`com.wander.app` iOS + Android).
      _Apple/Google paid accounts, signing artifacts, and submission are launch-phase items
      (external lead-time); EAS `submit` profile stub is in place._
- [x] Add web sign-in (Microsoft Entra) and prove end-to-end auth against the deployed API.
      _PKCE via `expo-auth-session`; `WebBrowser.maybeCompleteAuthSession()` for the web popup;
      web-safe session storage (localStorage on web, SecureStore on native); API audience/CORS
      aligned to the token. `deploy-web` bakes the Entra config into the bundle._
- [x] Add on-demand multi-environment deploy. _`deploy-manual.yml` (`workflow_dispatch`) deploys
      `dev`/`staging`/`prod` with the same proven steps; never auto-runs._
- [x] Verify secrets management in Key Vault for environment configs.
      _RBAC Key Vault; generated secrets + provider-key placeholders; App Service reads via
      managed-identity Key Vault references._
- [x] **Upgrade API cache from `IMemoryCache` → Azure Cache for Redis** (`IDistributedCache`).
      Current in-process cache breaks under multiple App Service instances (each instance has its
      own independent cache, causing duplicate Place/Weather provider fetches and wasted quota).
      Steps: provision Redis per environment → `AddStackExchangeRedisCache` in `Program.cs` →
      update `CachingPlaceProvider` + `CachingWeatherProvider` to `IDistributedCache` → add
      `Cache:RedisConnectionString` to Key Vault. No controller or provider logic changes needed.
      See architecture §6 "API caching strategy".
- [x] Document deployment runbook + rollback steps. _(`docs/deployment-runbook.md`.)_

## Progress log
- **2026-05-31 (slices 1–4, 6):**
  - **Slice 1 — Redis/distributed cache:** `IMemoryCache → IDistributedCache` across `Program.cs`
    and both cache decorators (Redis when `Cache:RedisConnectionString` set, in-process otherwise —
    local-first preserved). 49/49 backend tests green.
  - **Slice 2 — Bicep IaC:** subscription-scoped `infra/` (App Service, Postgres, Redis, Key Vault,
    Static Web Apps, App Insights) for dev/staging/prod; new `infra-validate` CI job.
  - **Slice 3 — CI deploy to dev:** `deploy-dev` job (OIDC → infra → migrations → API → `/health`),
    gated behind `DEPLOY_DEV`. One-time OIDC setup documented in `infra/README.md`.
  - **Slice 4 — Web pipeline:** `deploy-web` job exports Expo web (pointed at the deployed API) →
    Static Web Apps, gated behind `DEPLOY_WEB`.
  - **Slice 6 — Runbook:** `docs/deployment-runbook.md` (deploy, rollback, teardown, troubleshooting).
  - **CI fix:** the pre-existing "Verify EF migrations compile" step failed (`--no-build` looked in
    `bin/Debug` after a Release-only build); now passes `--configuration Release`.
- **2026-06-01 → 06-03 (dev deploy proven + auth + slice 5):**
  - **First real dev deploy** to Azure App Service; resolved live blockers: B1 App Service quota
    (support ticket), Azure Cache for Redis retirement → **Azure Managed Redis** Bicep rewrite
    (optional per env, dev runs without it), App Insights SDK 3.x crashing on unresolved Key Vault
    references (hardened in `Program.cs`), and Key Vault RBAC propagation timing.
  - **Web Entra sign-in** working end-to-end against the deployed dev API (popup completion,
    web-safe session storage, audience/CORS alignment, localhost CORS ports in `dev.bicepparam`).
  - **Slice 5 — EAS:** `eas.json` + `app.json` (bundle IDs, fingerprint runtime), `expo-updates`,
    `mobile-update` OTA CI job.
  - **Manual deploy:** `deploy-manual.yml` for on-demand dev/staging/prod.
  - **App Service slow-start fix:** `WEBSITES_CONTAINER_START_TIME_LIMIT=600` + Always On so B1's
    ~200s cold start no longer false-fails `az webapp deploy` (in `appService.bicep`).

## Out of scope
- Public launch hardening and full store submission (Phase 9).
- Responsive web/iPad layout — deferred (currently a phone-frame web view); see runbook §10.
- Actual staging/prod stand-up (cost + CIAM tenants) and native mobile sign-in redirect URI.

## Exit criteria — all met
- [x] CI deploys successfully to at least one Azure environment. _(dev, live.)_
- [x] Database migrations are part of deployment workflow. _(pipeline `dotnet ef database update`.)_
- [x] One internal mobile build path is proven. _(EAS profiles + OTA wiring; cloud build needs `eas login`.)_
- [x] Deployment/recovery steps are documented and repeatable. _(`docs/deployment-runbook.md`.)_
