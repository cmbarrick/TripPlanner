# Phase 3 Summary — Deployment & Release Foundations

Date: 2026-06-03
Status: Complete. All exit criteria met. Several stand-up/launch items intentionally deferred
(documented below, not blocked).

---

## Outcome

Phase 3 moved Wander from a local-only app to a **deployed, repeatable cloud release**. The `dev`
environment is **live on Azure**, provisioned entirely from Bicep and deployed by CI: API on App
Service, schema applied by the pipeline, secrets in Key Vault, and the Expo web build shippable to
Static Web Apps. A user can now **sign in with Microsoft Entra on the web** and read/write their own
trips against the cloud API and cloud Postgres. Mobile release plumbing (EAS Build + OTA Update) and
an on-demand multi-environment deploy are in place, so promoting to staging/prod or shipping a mobile
build is a configuration-and-credentials step, not new engineering.

The guiding constraint held throughout: **local-first still works with zero cloud setup**, and the
app degrades gracefully (in-process cache when no Redis; dev-bypass auth locally; fake providers
when no key).

---

## What Was Completed

### Infrastructure as Code (Bicep, `infra/`)
- Subscription-scoped `main.bicep` provisions one resource group per environment and wires modules:
  - `appService.bicep` — Linux App Service plan + .NET 9 web app, system-assigned managed identity,
    HTTPS-only, `/health` health check, app settings (incl. Key Vault references + CORS).
  - `postgres.bicep` — Azure Database for PostgreSQL Flexible Server.
  - `keyVault.bicep` — RBAC Key Vault; generated secrets + provider-key placeholders.
  - `staticWebApp.bicep` — Azure Static Web Apps for the Expo web export.
  - `redis.bicep` — **Azure Managed Redis** (`Microsoft.Cache/redisEnterprise`), optional per env.
  - App Insights + Log Analytics for observability.
- Per-environment params: `dev` (cost-optimized B1, no Redis), `staging` (B1 + Redis),
  `prod` (P1v3 + GeneralPurpose Postgres + Redis).
- `infra-validate` CI job builds the template and all three param files on every push/PR.

### CI/CD (`.github/workflows/`)
- `ci.yml`:
  - `validate` — backend build/test, app lint/typecheck/test, EF migrations compile.
  - `infra-validate` — Bicep build + param validation.
  - `deploy-dev` (gated `DEPLOY_DEV`) — OIDC login → Bicep deploy → temp PG firewall → `dotnet ef
    database update` → publish + zip-deploy API → smoke-test `/health`.
  - `deploy-web` (gated `DEPLOY_WEB`) — export Expo web (API URL **and Entra auth config** baked in)
    → upload to Static Web Apps.
  - `mobile-update` (gated `DEPLOY_MOBILE`) — `eas update` OTA publish to the `production` channel.
- `deploy-manual.yml` — `workflow_dispatch` deploy for **dev / staging / prod** on demand (same proven
  steps; pulls per-environment GitHub Environment secrets; never auto-runs).

### Distributed cache upgrade
- `IMemoryCache` → `IDistributedCache` across `Program.cs` and both cache decorators
  (`CachingPlaceProvider`, `CachingWeatherProvider`). Uses Redis when `Cache:RedisConnectionString`
  is set, in-process distributed cache otherwise. No controller/provider logic changed.

### Web authentication (Microsoft Entra)
- App registration (SPA client + exposed API scope `access_as_user`) in the existing tenant.
- Client: PKCE via `expo-auth-session`; `WebBrowser.maybeCompleteAuthSession()` so the web popup
  returns the code and closes; **platform-safe session storage** (localStorage on web, SecureStore
  on native); env-driven config (`EXPO_PUBLIC_AUTH_*`).
- API: JWT bearer validation against the tenant authority; audience set to the **token's actual
  `aud`** (the bare client id for these v2 tokens, verified by decoding a live token).
- CORS allows the Static Web App origin + localhost dev ports (`extraCorsOrigins` in `dev.bicepparam`).
- Verified end-to-end: sign in on web → live trips load and persist to cloud Postgres.

### Mobile release plumbing (EAS)
- `app/eas.json` — `development` / `preview` / `production` build profiles with update channels and
  per-profile `EXPO_PUBLIC_*` env.
- `app/app.json` — `runtimeVersion.policy = fingerprint`, iOS `bundleIdentifier` + Android `package`
  = `com.wander.app`.
- `expo-updates` installed; `mobile-update` CI job publishes OTA updates.

### Operational hardening (from the first real deploys)
- **App Insights SDK 3.x** (OpenTelemetry) crashed on an unresolved Key Vault connection string;
  `Program.cs` now only enables it for a valid `InstrumentationKey=` string so the app starts.
- **App Service slow cold start** on B1 (~120–220s, exceeding the 230s warmup probe) made
  `az webapp deploy` report a false "site failed to start". Fixed with
  `WEBSITES_CONTAINER_START_TIME_LIMIT=600` + Always On (persisted in `appService.bicep`).
- Documented Key Vault RBAC propagation timing and the Redis-retirement migration.

### Documentation
- `docs/deployment-runbook.md` — deploy (auto + manual), staging/prod prerequisites, secrets,
  rollback, teardown, troubleshooting (incl. the auth/CORS/startup learnings), health/observability,
  EAS Build/Update, and a "deferred" section.
- `infra/README.md` — IaC layout, one-time OIDC setup, required secrets/variables (incl. the web
  auth variables and `mobile-update` config).

---

## Live `dev` resources

| Resource | Name |
|---|---|
| Resource group | `rg-wander-dev` |
| API (App Service) | `app-wander-dev-azgnto` (`https://app-wander-dev-azgnto.azurewebsites.net`) |
| Key Vault | `kv-wndr-dev-azgnto` |
| Static Web App | `swa-wander-dev` (`https://lemon-smoke-0a389bf0f.7.azurestaticapps.net`) |
| App Insights / Logs | `appi-wander-dev` / `log-wander-dev` |
| Region | `eastus2` · Redis: not deployed in dev (in-process cache) |

---

## New npm packages

| Package | Purpose |
|---|---|
| `expo-web-browser` | Completes the web OAuth popup (`maybeCompleteAuthSession`) |
| `expo-updates` | EAS Update (OTA) + runtime versioning |

---

## Helper scripts added

| Script | Purpose |
|---|---|
| `start-wander-cloud.cmd` / `scripts/start-cloud-web.ps1` | Run Expo web against the cloud API with real Entra sign-in |
| `stop-wander-cloud.cmd` / `scripts/stop-cloud-web.ps1` | Stop stacked Expo web dev servers (scans ports 8081–8090) |
| `scripts/seed-cloud-trips.console.js` | Seed the four sample trips into the signed-in cloud account |

---

## Deferred items (documented, not blocked)

| Item | Deferred to | Notes |
|---|---|---|
| Stand up `staging` / `prod` on Azure | When ready (cost) | Bicep + `deploy-manual` ready; needs CIAM tenants or workforce app reg, quota, per-env secrets, ~$45/mo Redis each |
| Real EAS cloud builds (`eas build`) | When ready | Needs `eas login` / `eas init`; profiles already defined |
| Native (iOS/Android) Entra sign-in | Before a mobile build that authenticates | Register a `wander://` mobile redirect URI on the app registration |
| App Store / Google Play submission | Launch (Phase 9) | Paid accounts, listings, signing, review; EAS `submit` stub in place |
| Responsive web / iPad layout | Later (cosmetic) | Web renders in a phone frame today; runbook §10 has the plan |
| Provider keys in cloud (Mapbox, Azure Maps) | When available | Key Vault placeholders set; app uses fake/no-key providers until filled |

---

## What's next

**Phase 4 — Notes & Journaling:** capture the trip as it happens — text + voice notes (audio +
Azure Speech-to-Text transcript), reflection prompts, offline-first capture, and photos attached
to notes.

**Phase 5 — AI Planning Assistant:** generate/refine itineraries via chat with tool-calling
(search places, add/move items, gap-fill), preference-aware, with per-user token quotas and AI
quality evals.
