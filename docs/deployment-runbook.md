# Deployment & Rollback Runbook — Wander

> Status: **Active** · Phase 3 · Last updated: 2026-05-31
> Scope: the `dev` Azure environment (the proven Phase 3 path). `staging`/`prod` use the
> same Bicep + pipeline with their own `.bicepparam` and secrets.

This is the operational companion to [`../infra/README.md`](../infra/README.md) (which covers
the IaC layout and one-time OIDC setup). Read that first for first-time setup.

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
| First deploy `/health` times out | Key Vault references not yet resolved after the identity's role assignment propagated | Wait a few minutes and re-run `deploy-dev`; then `az webapp restart` |
| `deps.json does not exist` in EF step | EF `--no-build` looking in `bin/Debug` after a Release-only build | Already fixed: EF step passes `--configuration Release` |
| Migration step can't reach Postgres | Runner IP not allowed | The pipeline adds/removes a temp firewall rule; for manual runs add your IP to the PG firewall |
| API 500s on data calls | `Cache--RedisConnectionString` or DB secret wrong | Check Key Vault values; confirm the App Service identity has **Key Vault Secrets User** |
| Web calls fail (CORS) | `Cors__AllowedOrigins__0` ≠ the SWA URL | Confirm the app setting matches the Static Web App hostname; redeploy infra |
| Provider returns fake data in cloud | Provider key secret still empty | Set the real key in Key Vault (Section 4) and restart |

---

## 8. Health & observability
- Liveness: `GET /health` → `{ "status": "ok", "service": "wander-api" }` (no DB dependency).
- Logs/metrics: Application Insights (`appi-wander-dev`) + Log Analytics (`log-wander-dev`).
