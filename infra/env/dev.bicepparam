using '../main.bicep'

param environmentName = 'dev'
param location = 'eastus2'

// Supplied at deploy time from a CI secret; never committed.
param postgresAdminPassword = readEnvironmentVariable('WANDER_PG_ADMIN_PASSWORD', '')

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
