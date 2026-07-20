using '../main.bicep'

param environmentName = 'staging'
param location = 'eastus2'

// Supplied at deploy time from a CI secret; never committed.
param postgresAdminPassword = readEnvironmentVariable('WANDER_PG_ADMIN_PASSWORD', '')

// Provider keys, supplied at deploy time from env/CI secrets; never committed. Empty => fake providers.
param mapboxAccessToken = readEnvironmentVariable('WANDER_MAPBOX_TOKEN', '')
param azureMapsKey = readEnvironmentVariable('WANDER_AZURE_MAPS_KEY', '')

param azureOpenAiEndpoint = readEnvironmentVariable('WANDER_AZURE_OPENAI_ENDPOINT', '')
param azureOpenAiApiKey = readEnvironmentVariable('WANDER_AZURE_OPENAI_API_KEY', '')

// Entra External ID values (non-secret) — same shared "Wander" tenant as dev/prod, see
// dev.bicepparam's comment and docs/deployment-runbook.md §11a. authAudience is the bare client
// id (the client sends the ID token as the API bearer, not the access token — see
// app/src/auth/session.ts) — must match exactly, not an api:// App ID URI.
param authAuthority = 'https://wandertripapp.ciamlogin.com/wandertripapp.onmicrosoft.com/v2.0'
param authAudience = 'b32700ac-b867-4a6a-a245-ceafc3c9de74'

// Staging mirrors dev SKUs to keep costs low until prod hardening, but enables Redis so the
// distributed-cache path is exercised before prod.
param appServiceSku = 'B1'
param postgresSku = 'Standard_B1ms'
param postgresTier = 'Burstable'
param deployRedis = true
param redisSkuName = 'Balanced_B0'
