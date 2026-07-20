using '../main.bicep'

param environmentName = 'dev'
param location = 'eastus2'

// Supplied at deploy time from a CI secret; never committed.
param postgresAdminPassword = readEnvironmentVariable('WANDER_PG_ADMIN_PASSWORD', '')

// Provider keys, supplied at deploy time from env/CI secrets; never committed. When empty the
// API falls back to its fake place/routing providers (so local-only deploys still work).
param mapboxAccessToken = readEnvironmentVariable('WANDER_MAPBOX_TOKEN', '')
param azureMapsKey = readEnvironmentVariable('WANDER_AZURE_MAPS_KEY', '')

// Azure OpenAI (Phase 5 planning assistant). When either is empty the API uses DisabledAiProvider.
param azureOpenAiEndpoint = readEnvironmentVariable('WANDER_AZURE_OPENAI_ENDPOINT', '')
param azureOpenAiApiKey = readEnvironmentVariable('WANDER_AZURE_OPENAI_API_KEY', '')

// Voice-note transcription stack (media Storage + Azure AI Speech + Flex Consumption Function) is
// provisioned/managed imperatively in dev, not by this template (the Bicep function module targets a
// Y1 plan, which can't host the existing Flex app). So instead of deployTranscription, we just wire
// the API to that existing storage + Function here — durably, so CI deploys stop disconnecting it.
// The callback key must match the Function's Api:CallbackKey (set as a CI secret).
param wireApiToExistingTranscription = true
param transcriptionCallbackKey = readEnvironmentVariable('WANDER_FUNCTIONS_CALLBACK_KEY', '')

// Entra External ID values (non-secret) — the "Wander" external tenant (consumer sign-up +
// Apple/email federation), shared across dev/staging/prod (see docs/deployment-runbook.md §11a; a
// single pre-launch tenant is a deliberate simplification, split later only if it starts to
// matter). Migrated off the old workforce-tenant dev-only sign-in
// (`login.microsoftonline.com/c37d0d41-...`, app registration "Wander Dev") once Apple sign-in was
// live-verified end to end against this tenant.
param authAuthority = 'https://wandertripapp.ciamlogin.com/wandertripapp.onmicrosoft.com/v2.0'
// The client sends the ID token as the API bearer, not the OAuth access token (see
// app/src/auth/session.ts) — the access token defaults to a Microsoft Graph audience since no
// custom API scope is exposed on the app registration, but the ID token's aud is always the
// client id by OIDC spec, which is what this must match exactly.
param authAudience = 'b32700ac-b867-4a6a-a245-ceafc3c9de74'

// Local Expo web client origins (Metro picks the next free port; 8081 is default, 8082 on fallback).
param extraCorsOrigins = [
  'http://localhost:8081'
  'http://localhost:8082'
  'http://localhost:19006'
]

// Cost-optimised dev SKUs (defaults, listed here for clarity).
param appServiceSku = 'B1'
param postgresSku = 'Standard_B1ms'
param postgresTier = 'Burstable'

// Azure Managed Redis has no cheap tier (~$45/mo); dev runs without it and uses the API's
// in-process distributed cache. Flip to true to exercise Redis in dev.
param deployRedis = false
param redisSkuName = 'Balanced_B0'
