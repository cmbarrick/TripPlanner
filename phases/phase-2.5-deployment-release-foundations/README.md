# Phase 2.5 — Deployment & Release Foundations

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
- [ ] Document deployment runbook + rollback steps.

## Out of scope
- Public launch hardening and full store submission (Phase 8).

## Exit criteria
- CI deploys successfully to at least one Azure environment.
- Database migrations are part of deployment workflow.
- One internal mobile build path is proven.
- Deployment/recovery steps are documented and repeatable.
