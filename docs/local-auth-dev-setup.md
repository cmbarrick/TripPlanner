# Local Auth Setup (Before Azure Deployment)

Use this to run Wander locally now, then switch cleanly to full Entra External ID + Google/Apple sign-in.

## Quick shortcut (start both services)

Double-click launchers at repo root:

- `start-wander.cmd` (start API + app)
- `stop-wander.cmd` (stop both)

From terminal:

```powershell
.\start-wander.cmd
.\stop-wander.cmd
```

Or call scripts directly:

From repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

Optional custom local dev user id:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -DevUserId "my-local-user"
```

Stop both:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-local.ps1
```

## 1) Run locally immediately (dev bypass)

The API has a development-only auth bypass so you can run the app before cloud identity is fully configured.

- Enabled only in `Development` via `Authentication:DevBypass:Enabled=true`
- Production config keeps this disabled
- Default dev user id: `local-dev-user`
- Optional override from client with `EXPO_PUBLIC_DEV_USER_ID` (sent as `X-Dev-User-Id`)

### API

```powershell
cd backend
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=localhost;Port=5432;Database=wander_dev;Username=postgres;Password=<your-password>" --project Wander.Api
dotnet run --project Wander.Api --launch-profile http
```

### App

```powershell
cd app
$env:EXPO_PUBLIC_DEV_USER_ID="local-dev-user"
npm run web
```

## 2) Enable real Entra JWT locally

Once your Entra External ID tenant exists, set backend values (user-secrets recommended):

- `Authentication:EntraExternalId:Authority`
- `Authentication:EntraExternalId:Audience`

Then configure client auth session env vars before starting Expo:

- `EXPO_PUBLIC_AUTH_ISSUER` (OIDC issuer URL)
- `EXPO_PUBLIC_AUTH_CLIENT_ID` (public/native client app id)
- `EXPO_PUBLIC_AUTH_AUDIENCE` (optional, if your setup requires it)
- `EXPO_PUBLIC_AUTH_SCOPES` (optional, defaults to `openid profile email offline_access`)

Example:

```powershell
cd app
$env:EXPO_PUBLIC_AUTH_ISSUER="https://<tenant-domain>/<policy-or-v2-endpoint>"
$env:EXPO_PUBLIC_AUTH_CLIENT_ID="<app-client-id>"
$env:EXPO_PUBLIC_AUTH_AUDIENCE="<api-audience>"
npm run web
```

Then disable bypass in dev API config:

```powershell
cd backend
dotnet user-secrets set "Authentication:DevBypass:Enabled" "false" --project Wander.Api
```

Finally, open the app Profile tab and use **Sign in** to complete Entra auth. API calls will
automatically include `Authorization: Bearer <token>` after sign-in.

## 3) Google + Apple sign-in support

Yes — Entra External ID can federate both.

To complete it:
- Create identity providers (Google + Apple) in Entra External ID
- Add provider client IDs/secrets/cert material in Entra
- Add them to your user flow/policy
- Configure Expo redirect URIs/client app registration
- Validate API JWT claims (`iss`, `aud`, `sub`) against your tenant config

Until this is wired, local dev bypass keeps API development unblocked.
