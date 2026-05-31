# Phase 3 — Deployment & Release Foundations

> Goal: Move from local-first development to repeatable cloud/stores release infrastructure.
> Est: ~1–2 weeks · Depends on: Phase 2

## Objectives
- Stand up Azure deployment targets and environment topology.
- Prove CI/CD deployment flow for backend and web.
- Establish mobile release plumbing (EAS + store prerequisites), without full public launch yet.

## Scope / tasks
- [ ] Create Azure resource groups for `dev` / `staging` / `prod`.
- [ ] Provision API hosting target (locked: **Azure App Service**) and deploy from CI.
- [ ] Set up cloud PostgreSQL environments and migration strategy.
- [ ] Configure web deployment target and pipeline stage.
- [ ] Configure EAS Build/Update for internal mobile builds.
- [ ] Complete store groundwork: Apple/Google accounts, bundle IDs/package IDs, signing artifacts.
- [ ] Verify secrets management in Key Vault for environment configs.
- [ ] **Upgrade API cache from `IMemoryCache` → Azure Cache for Redis** (`IDistributedCache`).
      Current in-process cache breaks under multiple App Service instances (each instance has its
      own independent cache, causing duplicate Place/Weather provider fetches and wasted quota).
      Steps: provision Redis per environment → `AddStackExchangeRedisCache` in `Program.cs` →
      update `CachingPlaceProvider` + `CachingWeatherProvider` to `IDistributedCache` → add
      `Cache:RedisConnectionString` to Key Vault. No controller or provider logic changes needed.
      See architecture §6 "API caching strategy".
- [ ] Document deployment runbook + rollback steps.

## Out of scope
- Public launch hardening and full store submission (Phase 9).

## Exit criteria
- CI deploys successfully to at least one Azure environment.
- Database migrations are part of deployment workflow.
- One internal mobile build path is proven.
- Deployment/recovery steps are documented and repeatable.
