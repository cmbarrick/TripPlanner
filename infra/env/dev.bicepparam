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

// Entra External ID values for the dev environment (non-secret).
// Dev identity: app registration "Wander Dev" in the Pay-As-You-Go tenant (workforce sign-in
// for testing). Swap to an Entra External ID tenant when moving to public/customer sign-up.
param authAuthority = 'https://login.microsoftonline.com/c37d0d41-1d23-42ec-b2a9-142f6013c9c5/v2.0'
// v2 access tokens for this app's exposed scope carry aud = the bare client id (verified by
// decoding a live token), not the api:// App ID URI. Must match the JwtBearer Audience exactly.
param authAudience = '2fc17871-0fc0-414a-a86c-78de362fe29a'

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
