# Infrastructure (Bicep) — Wander

Infrastructure-as-Code for the Phase 3 Azure environments. **Bicep** is the chosen tool
(Azure-native, no state backend to manage, lints/compiles in CI with no subscription).

## Layout

```
infra/
  main.bicep                 # subscription-scoped: creates the RG + all resources
  bicepconfig.json           # linter rules
  modules/
    monitoring.bicep         # Log Analytics + Application Insights
    postgres.bicep           # PostgreSQL Flexible Server + database + firewall
    redis.bicep              # Azure Cache for Redis
    keyVault.bicep           # Key Vault + secrets (generated + provider-key placeholders)
    keyVaultRoleAssignment.bicep  # grants the API identity "Key Vault Secrets User"
    appService.bicep         # Linux App Service plan + .NET 9 web app (KV-ref app settings)
    staticWebApp.bicep       # Azure Static Web Apps (Expo web target)
  env/
    dev.bicepparam           # only `dev` is wired to CI deploy (Phase 3 exit criterion)
    staging.bicepparam
    prod.bicepparam
```

## What gets created per environment

| Resource | dev / staging SKU | prod SKU |
|---|---|---|
| App Service plan (Linux) | B1 | P1v3 |
| PostgreSQL Flexible Server | Burstable B1ms | GeneralPurpose D2ds_v5 |
| Azure Cache for Redis | Basic C0 | Standard C1 |
| Key Vault | standard (RBAC) | standard (RBAC) |
| Static Web App | Free | Free |
| Log Analytics + App Insights | PerGB2018 | PerGB2018 |

Resource names follow `‹type›-wander-‹env›`, with a short `uniqueString` suffix on the
globally-unique ones (App Service, Postgres, Redis, Key Vault). Key Vault uses the short
prefix `kv-wndr-‹env›-‹suffix›` to stay within the 24-character limit.

## Secrets model (nothing committed)

- **Generated at deploy time** and written to Key Vault by `keyVault.bicep`:
  `ConnectionStrings--DefaultConnection` (Postgres), `Cache--RedisConnectionString` (Redis),
  `ApplicationInsights--ConnectionString`.
- **Provider keys** are created as **empty placeholders** so the App Service Key Vault
  references resolve. An empty value makes the API fall back to its Fake/no-key provider
  seam (see `Program.cs`). Fill the real values out-of-band, e.g.:

  ```bash
  az keyvault secret set --vault-name <kv-name> --name Places--MapboxAccessToken --value <token>
  az keyvault secret set --vault-name <kv-name> --name Routing--AzureMapsKey      --value <key>
  ```

- The **Postgres admin password** is supplied at deploy time from the `WANDER_PG_ADMIN_PASSWORD`
  environment variable (read by the `.bicepparam` files); it is never stored in the repo.

The App Service reads everything via Key Vault references (`@Microsoft.KeyVault(...)`) using
its system-assigned managed identity, which is granted **Key Vault Secrets User**.

## Validate locally (no Azure subscription needed)

```bash
az bicep build --file infra/main.bicep
az bicep build-params --file infra/env/dev.bicepparam
```

## Deploy (requires subscription access — wired into CI for `dev` in a later slice)

```bash
# Preview
az deployment sub what-if \
  --location eastus2 \
  --template-file infra/main.bicep \
  --parameters infra/env/dev.bicepparam

# Apply (WANDER_PG_ADMIN_PASSWORD must be set in the environment)
az deployment sub create \
  --location eastus2 \
  --template-file infra/main.bicep \
  --parameters infra/env/dev.bicepparam
```

## CI deployment (GitHub Actions → Azure, OIDC)

The `deploy-dev` job in `.github/workflows/ci.yml` runs on every push to `main` after tests
pass. It logs in with **OIDC** (no stored password), deploys the Bicep infra, applies EF
migrations, deploys the API, and smoke-tests `/health`.

### One-time setup

Run once, signed in as a subscription Owner (`az login` first). This creates the identity
GitHub will use and grants it access:

```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

# 1. App registration + service principal for GitHub to log in as.
APP_ID=$(az ad app create --display-name "wander-github-deploy" --query appId -o tsv)
az ad sp create --id "$APP_ID"

# 2. Trust deployments from this repo's `dev` GitHub environment (passwordless).
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "wander-dev-env",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:cmbarrick/TripPlanner:environment:dev",
  "audiences": ["api://AzureADTokenExchange"]
}'

# 3. Let it create resources + role assignments across the subscription.
#    (Owner is simplest as the sub owner; can be scoped down later.)
az role assignment create --assignee "$APP_ID" --role "Owner" \
  --scope "/subscriptions/$SUBSCRIPTION_ID"

# 4. Print the values to paste into GitHub.
echo "AZURE_CLIENT_ID=$APP_ID"
echo "AZURE_TENANT_ID=$TENANT_ID"
echo "AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID"
```

### GitHub configuration

In the repo: **Settings → Environments → New environment → `dev`**, then add these as
**environment secrets** (Settings → Secrets and variables → Actions also works at repo level):

| Secret | Value |
|---|---|
| `AZURE_CLIENT_ID` | the app id printed above |
| `AZURE_TENANT_ID` | the tenant id printed above |
| `AZURE_SUBSCRIPTION_ID` | the subscription id printed above |
| `WANDER_PG_ADMIN_PASSWORD` | a strong Postgres admin password you choose |
| `AZURE_SWA_TOKEN_DEV` | the dev Static Web App deployment token (for the web deploy) |

The `AZURE_SWA_TOKEN_DEV` value comes from the Static Web App created by the Bicep deploy
(`swa-wander-dev`). After the first infra deploy, fetch it with:

```bash
az staticwebapp secrets list --name swa-wander-dev --resource-group rg-wander-dev \
  --query properties.apiKey -o tsv
```

> The job uses `environment: dev`, so the OIDC token's subject is
> `repo:cmbarrick/TripPlanner:environment:dev` — which is exactly what the federated
> credential above trusts. Add another federated credential (e.g.
> `repo:cmbarrick/TripPlanner:environment:staging`) when wiring more environments.

### Turn it on

The `deploy-dev` job is gated behind a repo **variable** so it stays dormant until you're
ready. Once the secrets above are set, enable it:

**Settings → Secrets and variables → Actions → Variables** → add `DEPLOY_DEV` = `true`.

After that, every push to `main` deploys the `dev` API automatically. Set it to `false` (or
delete it) to pause auto-deploy without removing the pipeline.

**Web deploy:** the `deploy-web` job (Expo web → Static Web Apps) is gated separately behind
`DEPLOY_WEB` = `true`. Enable it only after the first API deploy has created `swa-wander-dev`
and you've added the `AZURE_SWA_TOKEN_DEV` secret above. It needs both `DEPLOY_DEV` and
`DEPLOY_WEB` set, since it consumes the API host from the API deploy job.

> Production hardening (VNet integration + private endpoints for Postgres/Redis, HA,
> geo-redundant backups) is tracked in the deployment runbook and is out of scope for the
> initial Phase 3 topology.
