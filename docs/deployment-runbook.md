# Deployment & Rollback Runbook — Wander

> Status: **Active** · Phase 3 · Last updated: 2026-06-05
> Scope: the `dev` Azure environment (the proven Phase 3 path) + web Entra sign-in. `staging`/
> `prod` use the same Bicep + pipeline with their own `.bicepparam` and secrets (Section 3b);
> mobile ships via EAS (Section 9).

This is the operational companion to [`../infra/README.md`](../infra/README.md) (which covers
the IaC layout and one-time OIDC setup). Read that first for first-time setup.

---

## ⚠️ Open item to revisit (2026-06-03)

**Verify live web sign-in end-to-end.** The deployed web bundle now ships with the Entra config
(auth defaults baked into `ci.yml`) and a SWA navigation-fallback (`app/public/staticwebapp.config.json`,
so `/auth?code=…` no longer 404s). A one-off bundle with both fixes was deployed to
`swa-wander-dev`. **Still to confirm when back:** click **Sign in** on the live SWA
(`lemon-smoke-0a389bf0f.7.azurestaticapps.net`), complete the Entra popup, and confirm the
"Showing demo data" banner is replaced by real trips (the `401` on `/api/trips` seen in the
console is just the signed-out state — it should disappear once a bearer token is attached).
If sign-in still fails: check (a) the bundle is the latest (hard refresh / private window),
(b) the token's `aud` matches the API's `Authentication:EntraExternalId:Audience`, and
(c) the access token hasn't expired (~1h). See §7 (web auth troubleshooting).

---

## 1. What gets deployed

| Component | Target | How |
|---|---|---|
| API (.NET 9) | Azure App Service (`app-wander-dev-*`) | `dotnet publish` → `az webapp deploy` (zip) |
| Database schema | Azure Database for PostgreSQL | `dotnet ef database update` in the pipeline |
| Web (Expo export) | Azure Static Web Apps (`swa-wander-dev`) | `Azure/static-web-apps-deploy` |
| Secrets | Azure Key Vault (`kv-wndr-dev-*`) | written by Bicep; read via Key Vault references |
| Infra | Resource group `rg-wander-dev` | `az deployment sub create` (Bicep) |

Migrations are **pipeline-owned**: the App Service runs with `Database__MigrateOnStartup=false`,
so the app never self-migrates in the cloud (avoids multi-instance races). Local dev keeps
`MigrateOnStartup=true` (the default) for a zero-setup loop.

---

## 2. Normal deploy (automated)

Trigger: **push to `main`** with repo variable `DEPLOY_DEV=true` (and `DEPLOY_WEB=true` for web).

Pipeline order (`.github/workflows/ci.yml`):
1. `validate` + `infra-validate` (build, tests, lint, Bicep build) — must pass.
2. `deploy-dev`:
   1. OIDC login to Azure.
   2. `az deployment sub create` — provisions/updates infra (idempotent).
   3. Open a temporary Postgres firewall rule for the runner IP.
   4. `dotnet ef database update` — applies migrations.
   5. Close the firewall rule (runs even on failure).
   6. Publish + zip-deploy the API.
   7. Smoke-test `/health` (retries up to 3 min).
3. `deploy-web`: export Expo web (pointed at the deployed API) → upload to Static Web Apps.

To pause auto-deploy without deleting anything: set `DEPLOY_DEV` / `DEPLOY_WEB` to `false`.

---

## 3. Manual deploy (break-glass / first run)

From a machine with `az` + .NET 9, signed in as a subscription contributor:

```bash
az login
az account set --subscription "<id>"
export WANDER_PG_ADMIN_PASSWORD="<password>"        # PowerShell: $env:WANDER_PG_ADMIN_PASSWORD

# 1. Infra (preview first)
az deployment sub what-if --location eastus2 --template-file infra/main.bicep --parameters infra/env/dev.bicepparam
az deployment sub create  --location eastus2 --template-file infra/main.bicep --parameters infra/env/dev.bicepparam

# 2. Capture names
RG=rg-wander-dev
APP=$(az webapp list -g $RG --query "[0].name" -o tsv)
PG=$(az postgres flexible-server list -g $RG --query "[0].fullyQualifiedDomainName" -o tsv)

# 3. Migrations (add your IP to the PG firewall first if needed)
CONN="Host=$PG;Port=5432;Database=wander;Username=wanderadmin;Password=$WANDER_PG_ADMIN_PASSWORD;SSL Mode=Require;Trust Server Certificate=true"
dotnet ef database update --project backend/Wander.Api/Wander.Api.csproj --connection "$CONN"

# 4. API
dotnet publish backend/Wander.Api/Wander.Api.csproj -c Release -o ./publish
cd publish && zip -r ../api.zip . && cd ..
az webapp deploy -g $RG -n $APP --src-path api.zip --type zip

# 5. Verify
curl -s -o /dev/null -w "%{http_code}\n" "https://$(az webapp show -g $RG -n $APP --query defaultHostName -o tsv)/health"
```

---

## 3b. On-demand deploy for any environment (`deploy-manual` workflow)

`.github/workflows/deploy-manual.yml` runs the same steps as `deploy-dev` but is triggered
manually for a chosen environment, so it never deploys (or spends) on its own:

**Actions → `deploy-manual` → Run workflow → pick `dev` / `staging` / `prod`.**

It reads environment-scoped secrets from the matching **GitHub Environment**, so each
environment needs its own `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
and `WANDER_PG_ADMIN_PASSWORD`. For `prod`, add **required reviewers** on the GitHub
Environment to gate the run behind manual approval.

### Staging / prod prerequisites (before the first run)

1. **OIDC federation per environment** — repeat the federated-credential step in
   `infra/README.md` for the `staging` and `prod` GitHub Environments (the subject differs
   per environment).
2. **Identity / auth tenant** — `staging.bicepparam` / `prod.bicepparam` point `authAuthority`
   at Entra **External ID (CIAM)** tenants (`*.ciamlogin.com`) that must be created first, or
   switched to a workforce app registration like dev. The deploy will succeed without it, but
   sign-in won't work until `authAuthority`/`authAudience` are real. Confirm `authAudience`
   matches the token `aud` (dev uses the **bare client id**, not the `api://` URI — verify by
   decoding a real token).
3. **Quota** — `prod` uses `P1v3` App Service + `Standard_D2ds_v5` Postgres; request quota in
   the target region first (dev hit this on `B1`).
4. **Cost** — `staging` and `prod` both set `deployRedis = true` (~$45/mo Managed Redis each)
   plus dedicated compute. Don't stand these up until you intend to pay for them; tear down
   with `az group delete` (Section 6) when idle.

---

## 4. Secrets

- **Generated** by Bicep at deploy time: `ConnectionStrings--DefaultConnection`,
  `ApplicationInsights--ConnectionString`, and `Cache--RedisConnectionString` (only when
  `deployRedis = true`; dev runs without Redis and uses the API's in-process cache).
- **Provider keys** start as empty placeholders (API falls back to Fake/no-key providers).
  Fill when available:
  ```bash
  az keyvault secret set --vault-name <kv> --name Places--MapboxAccessToken --value <token>
  az keyvault secret set --vault-name <kv> --name Routing--AzureMapsKey      --value <key>
  ```
  Then **restart the App Service** so it re-resolves Key Vault references:
  `az webapp restart -g rg-wander-dev -n <app>`.
- Never commit secrets. CI uses GitHub secrets + OIDC; the DB password is `WANDER_PG_ADMIN_PASSWORD`.

---

## 5. Rollback

### API code (fastest — re-deploy the last good build)
The pipeline deploys from a build artifact. To roll back:
- **Re-run** the last green `deploy-dev` run in GitHub Actions (Actions → that run → "Re-run jobs"), or
- Check out the previous good commit and push, or
- Manually zip-deploy a known-good `publish` output (Section 3, step 4).

> Tip for instant rollback later: enable an App Service **deployment slot** (`staging` slot)
> and deploy there first, then `az webapp deployment slot swap`. Swapping back is the
> rollback. Not provisioned in the initial dev topology — add to `appService.bicep` when needed.

### Database migration
EF migrations are forward-only by default. To undo the most recent migration:
```bash
# Re-apply the schema as of the previous migration (writes the down SQL):
dotnet ef database update <PreviousMigrationName> --project backend/Wander.Api/Wander.Api.csproj --connection "$CONN"
```
For data-loss-risky changes, prefer **point-in-time restore** of the Flexible Server
(default 7-day retention):
```bash
az postgres flexible-server restore --resource-group rg-wander-dev \
  --name psql-wander-dev-restored --source-server <server> --restore-time "<UTC timestamp>"
```
Then repoint `ConnectionStrings--DefaultConnection` and restart the API.

### Web
Re-run the previous `deploy-web` (Static Web Apps keeps the last upload live until replaced),
or re-export from a known-good commit.

### Config / secret mistake
Restore a previous secret value (soft-delete is on, 7-day retention):
```bash
az keyvault secret list-versions --vault-name <kv> --name <secret>   # find prior version
az keyvault secret set --vault-name <kv> --name <secret> --value "<previous>"
az webapp restart -g rg-wander-dev -n <app>
```

---

## 6. Teardown (stop all dev cost)

```bash
az group delete --name rg-wander-dev --yes --no-wait
```
Re-running the pipeline (or the Section 3 manual steps) recreates everything. Note: Key Vault
soft-delete means the vault name is reserved for 7 days; `--purge` if you must reuse it sooner.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `az webapp deploy` reports "site failed to start within 10 mins" but the app is actually up | B1's .NET cold start (~120–220s, mostly container/runtime init before "Now listening") exceeds the default **230s** warmup-probe limit, so the first start attempt is marked failed even though App Service retries and succeeds. | Set `WEBSITES_CONTAINER_START_TIME_LIMIT=600` (now in `appService.bicep`) and enable **Always On** so the slow first start fits the probe window and the container stays warm. Verify with `GET /health`. For genuinely faster starts, scale the App Service plan up. |
| First deploy `/health` times out; container exits with `InstrumentationKey is missing` | On a brand-new environment the App Service identity's `Key Vault Secrets User` grant hasn't propagated to the vault's data plane yet, so `@Microsoft.KeyVault(...)` references resolve to **AccessToKeyVaultDenied** and the app gets the literal reference strings. (The app no longer crashes on this — App Insights is skipped when its connection string is invalid — but data secrets are still unresolved.) | Wait ~5–10 min for RBAC to propagate, then force re-resolution: change/add any app setting (e.g. `az webapp config appsettings set --settings KV_REFRESH=1`) or `az webapp restart`. Verify with `az rest GET .../config/configreferences/appsettings` → all should be `Resolved`. |
| `deps.json does not exist` in EF step | EF `--no-build` looking in `bin/Debug` after a Release-only build | Already fixed: EF step passes `--configuration Release` |
| Migration step can't reach Postgres | Runner IP not allowed | The pipeline adds/removes a temp firewall rule; for manual runs add your IP to the PG firewall |
| API 500s on data calls | `Cache--RedisConnectionString` or DB secret wrong | Check Key Vault values; confirm the App Service identity has **Key Vault Secrets User** |
| Web calls fail (CORS) | `Cors__AllowedOrigins__0` ≠ the SWA URL, or local web port not allowed | Confirm the SWA hostname matches; for local Expo web add the port to `extraCorsOrigins` in `dev.bicepparam` (8081/8082/19006 are included) |
| Signed in but API returns 401 | `Authentication__EntraExternalId__Audience` ≠ token `aud`, or expired token | Decode the access token (`aud`, `iss`); set Audience to the exact `aud` (dev = bare client id, **not** `api://…`); re-sign-in if the token expired |
| Web sign-in popup shows "Unmatched Route" and never returns | `WebBrowser.maybeCompleteAuthSession()` not called on the redirect page | Already fixed in `app/app/_layout.tsx`; ensure `expo-web-browser` is installed |
| Provider returns fake data in cloud | Provider key secret still empty | Set the real key in Key Vault (Section 4) and restart |

---

## 8. Health & observability
- Liveness: `GET /health` → `{ "status": "ok", "service": "wander-api" }` (no DB dependency).
- Logs/metrics: Application Insights (`appi-wander-dev`) + Log Analytics (`log-wander-dev`).

---

## 9. Mobile (EAS Build & Update)

The Expo app ships to stores via **EAS Build** (native binaries) and patches them over-the-air
via **EAS Update**. Config lives in `app/eas.json` (build profiles + channels) and `app/app.json`
(`runtimeVersion.policy = fingerprint`, iOS `bundleIdentifier` / Android `package` = `com.wander.app`).

### One-time setup
```bash
cd app
npm i -g eas-cli         # or use npx eas-cli
eas login                # the Expo account that owns the project
eas init                 # creates the EAS project; writes extra.eas.projectId + updates.url
```

### Builds (creates native binaries — costs build minutes)
```bash
eas build --profile development --platform all   # dev client for local testing
eas build --profile preview     --platform all   # internal distribution (TestFlight / APK)
eas build --profile production  --platform all   # store-ready
```
Each profile bakes its `EXPO_PUBLIC_*` env from `eas.json`. Update those values (API URL,
Entra issuer/client/scopes) per profile as real environments come online.

### OTA updates (JS-only, cheap/instant)
```bash
eas update --branch production --message "fix: ..."   # patches installed builds w/ matching runtimeVersion
```
CI does this automatically: the `mobile-update` job in `ci.yml` runs `eas update --branch
production` on push to `main` when `DEPLOY_MOBILE=true` and the `EXPO_TOKEN` secret is set.
Set `MOBILE_API_URL` (repo variable) to point the mobile bundle at the right API.

### Required GitHub config for `mobile-update`
| Kind | Name | Purpose |
|---|---|---|
| Secret | `EXPO_TOKEN` | Expo access token (expo.dev → Account → Access tokens) |
| Variable | `DEPLOY_MOBILE` | `true` to enable the OTA job |
| Variable | `MOBILE_API_URL` | API base URL the mobile bundle calls (defaults to dev API) |
| Variable (optional) | `EXPO_PUBLIC_AUTH_ISSUER` / `EXPO_PUBLIC_AUTH_CLIENT_ID` / `EXPO_PUBLIC_AUTH_SCOPES` | Entra config baked into the bundle. **Default to the dev app registration in `ci.yml`**; only set to override for a different tenant. |

> **Native sign-in follow-up:** native (iOS/Android) Entra sign-in uses the custom-scheme redirect
> `wander://auth` (`AuthSession.makeRedirectUri({ scheme: 'wander', path: 'auth' })`). Register it on
> the **same** dev app registration (`2fc17871-0fc0-414a-a86c-78de362fe29a`) under
> **Authentication → Add a platform → Mobile and desktop applications** (a SPA platform only accepts
> https redirects, so the mobile redirect must live under the mobile/desktop platform). Web sign-in
> (current) keeps using the SPA redirect URIs. The auth env vars themselves are now baked into every
> EAS build profile (`app/eas.json`), so a dev build authenticates once this redirect is registered.

---

## 10. Deferred (not in Phase 3)

- **Responsive layout for web + iPad** — web currently renders inside a fixed 400×760 "phone"
  frame (`styles.phone` in `app/App.tsx`); the shared layout is phone-width. For the companion
  web app and iPad (`ios.supportsTablet: true`), do a small width-aware pass: drop the web phone
  frame, center content at a ~720–820px max width above a ~700px breakpoint (via
  `useWindowDimensions`), constrain the tab bar to the content column, and decide iPad orientation
  (portrait-lock vs allow landscape). Cosmetic only — no impact on API/auth/native phone build.
- **App Store / Google Play submission** — paid developer accounts, store listings, signing, and
  review. The EAS build/submit plumbing (Section 9) is ready; actual publishing is a launch-phase task.

---

## 11. Pre-public-launch checklist — auth & app stores (NOT blocking device/TestFlight testing)

> Captured 2026-06-05. **None of this blocks a development build or internal TestFlight** on your
> own device (those don't go through full App Review, and the current Microsoft sign-in works for a
> single tester). These are gates for **public store release** and for **real consumer sign-up**.
> Decoupled on purpose so native feature work (Phase 4 notifications, audio, photos) isn't held up.

### 11a. Login expansion (consumer sign-up + Apple's Guideline 4.8)
Today the app authenticates **only via a Microsoft workforce tenant** (`login.microsoftonline.com/<tenant>`),
which requires a Microsoft work/school account — fine for internal testing, **not viable for public
consumers**. Before public launch:

1. **Migrate to Entra External ID (CIAM)** for the public app — a customer (CIAM) tenant supporting
   self-service email/password sign-up + social IdPs. The app is already OIDC/PKCE against a
   **configurable issuer + client id** (`EXPO_PUBLIC_AUTH_*` / `Authentication:EntraExternalId:*`),
   so this is mostly **tenant + config**, not app rewrite. (`staging`/`prod` `.bicepparam` already
   point at `*.ciamlogin.com` placeholders — see §3b.)
2. **Apple Guideline 4.8 (Login Services):** if the app offers a **third-party/social login**
   (Google, **Microsoft**, Facebook, …) to set up the primary account, it **must also offer an
   equivalent privacy-preserving login** — in practice Apple enforces **Sign in with Apple**.
   - **Implication:** the moment we add Google (or keep Microsoft) as a consumer option, **Sign in
     with Apple is required for App Store approval.**
   - **Exception** worth knowing: not required if the app *exclusively uses our own account system*
     (e.g. Entra External ID email/password only, no social). Realistically we'll want Google + Apple,
     so plan for Sign in with Apple.
   - **Low-debt approach:** federate **Apple + Google as IdPs inside Entra External ID** (broker
     model) so the app keeps doing a single OIDC flow; provider buttons appear on the hosted page.
3. **Native redirect URI:** register **`wander://auth`** (and/or the Expo proxy) as a *mobile/native*
   redirect on the app registration — on-device sign-in fails without it (also noted in §9).
4. **Token `aud`:** confirm the CIAM app's access-token `aud` matches the API
   `Authentication:EntraExternalId:Audience` (dev uses the bare client id — verify by decoding a real token).

**Progress (2026-07-18) — Sign in with Apple, in progress, done through portal setup:**
- Discovered `Authentication:EntraExternalId:Authority` in `appsettings.json` was still Microsoft's
  literal placeholder (`contoso.ciamlogin.com`) — the External ID (CIAM) tenant had never actually
  been created, only planned. Created it: **External** tenant type, name `Wander`, domain
  `wandertripapp.onmicrosoft.com` (auth endpoint domain is `wandertripapp.ciamlogin.com`), tenant ID
  `903c7b62-9a4e-472a-a69b-242ecd9d969d`, in `rg-wander-dev` / East US region. Confirmed the
  workforce tenant's "External Identities" feature (under Default Directory) does **not** support
  Apple as a built-in IdP (only Google/Facebook/Microsoft/Email OTP) — Apple requires a real External
  tenant, not that lighter-weight guest-collaboration feature.
- iOS bundle ID had to change: `com.wander.app` was already taken on Apple's side. Now
  **`com.wandertripapp.app`** everywhere — updated in `app/app.json` (`ios.bundleIdentifier` +
  `android.package`, kept identical across platforms; uncommitted as of this note).
- Apple Developer portal, done: App ID `com.wandertripapp.app` (Sign In with Apple capability
  enabled) → Services ID `com.wandertripapp.app.signin` → Sign In with Apple key created (`.p8`
  downloaded once, Key ID `6MNU387WCY`, Team ID `GTV7SC6XM4`) → Services ID's Web Authentication
  Configuration (Domains/Return URLs) filled in and saved using the
  `<tenant-name>.ciamlogin.com` / `<tenant-id>.ciamlogin.com` pattern from Microsoft's official Apple
  federation doc.
- Entra side, done: switched into the new Wander tenant → External Identities → All identity
  providers → Apple → Configure, entered Client (Apple service) ID / Team ID / Key ID / uploaded the
  `.p8` secret → shows **Configured** (green check) in the identity-provider list.
**Progress (2026-07-20) — Sign in with Apple, working end to end:**
- App registration (`Wander Mobile`, Client ID `b32700ac-b867-4a6a-a245-ceafc3c9de74`) created in
  the Wander tenant with `wander://auth` registered as a native redirect (Mobile/desktop platform)
  plus `http://localhost:8081/auth`, `8082/auth`, `19006/auth` (SPA platform, for local web
  testing — Metro lands on different ports run to run).
- User flow `SignUpSignIn` (Sign up and sign in) created with **Apple** + **Email one-time
  passcode** as identity providers, `Wander Mobile` associated with it under Applications.
- `Authentication:EntraExternalId:Authority`/`Audience` (dev: `appsettings.Development.json`) and
  client env vars (`EXPO_PUBLIC_AUTH_ISSUER`/`CLIENT_ID`/`AUDIENCE` — see
  `scripts/start-local-entra.ps1`) now point at the real tenant.
- **Real bug found and fixed via live testing** (not reachable by any unit test — needed an actual
  Apple sign-in against the real tenant): `session.ts`'s token exchange sent
  `tokenResponse.accessToken` as the API bearer. Since the client only requests generic OIDC scopes
  (`openid profile email offline_access`) with no custom API resource scope exposed on the app
  registration, Entra's access token defaults to an audience of **Microsoft Graph**
  (`00000003-0000-0000-c000-000000000000`), not our own API — confirmed by decoding the actual
  token from `localStorage` client-side and cross-referencing the backend's `IDX10511: Signature
  validation failed` error (temporarily unmasked via `IdentityModelEventSource.ShowPII` +
  an `OnAuthenticationFailed` log line, both since removed — see git history if this needs
  re-diagnosing). Fixed: `session.ts` now sends **`tokenResponse.idToken`** instead — its `aud` is
  always the client id by OIDC spec, which already matched
  `Authentication:EntraExternalId:Audience`'s existing bare-client-id convention (item 4 above)
  with zero backend changes needed. The textbook long-term fix (expose a custom API scope via
  "Expose an API" on the app registration, request `api://<client-id>/access_as_user`, get a
  properly-audienced access token) remains a documented option but wasn't necessary here.
  **Hand-verified live end to end**: signed in with Apple, landed on Profile showing a real Entra
  session (`cmbarrick@gmail.com`), Trips tab correctly showed the live (empty) account instead of
  the demo-data fallback that appears on any API auth failure. `displayName` shows "unknown" (Apple
  only sends a name on the very first authorization; Entra apparently didn't forward it this time)
  — cosmetic, not blocking.
  `com.wandertripapp.app` bundle ID (`app/app.json`), the Entra tenant config, and the sign-in
  screen redesign were already committed in an earlier session (see git log); this session's fix
  (`session.ts`) is the only remaining piece to commit.

### 11b. Store submission prerequisites (when publishing)
- **iOS permission usage strings** (Info.plist via config plugins): microphone (voice notes),
  photo library (photo notes), and notifications. Add the `expo-image-picker` config plugin (not yet
  in `app.json` `plugins`) with its photo/permission descriptions; ensure `expo-audio` mic usage
  string is set; add `expo-notifications` plugin (Phase 4b).
- **Android 13+**: `POST_NOTIFICATIONS` runtime permission + a notification channel (handled by the
  Phase 4b notification code / `expo-notifications` plugin).
- **Privacy policy URL** + Apple **App Privacy** answers + Google Play **Data safety** form
  (we collect account email/id, journal content, audio, photos, approximate location for weather).
- **Screenshots, listing copy, age rating**, and pass App Review / Play review.
- **Encryption compliance** (`ITSAppUsesNonExemptEncryption` = false unless we add custom crypto).
