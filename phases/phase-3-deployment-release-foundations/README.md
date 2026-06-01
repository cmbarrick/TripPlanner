# Phase 3 — Deployment & Release Foundations

> Goal: Move from local-first development to repeatable cloud/stores release infrastructure.
> Est: ~1–2 weeks · Depends on: Phase 2

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
- [ ] Configure EAS Build/Update for internal mobile builds. _(Slice 5 — pending.)_
- [ ] Complete store groundwork: Apple/Google accounts, bundle IDs/package IDs, signing artifacts.
      _(Slice 5 — pending; accounts are external lead-time items.)_
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
  - **Remaining:** Slice 5 (EAS internal build + Apple/Google store groundwork).

## Out of scope
- Public launch hardening and full store submission (Phase 9).

## Exit criteria
- CI deploys successfully to at least one Azure environment.
- Database migrations are part of deployment workflow.
- One internal mobile build path is proven.
- Deployment/recovery steps are documented and repeatable.
