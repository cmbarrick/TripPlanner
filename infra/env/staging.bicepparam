using '../main.bicep'

param environmentName = 'staging'
param location = 'eastus2'

// Supplied at deploy time from a CI secret; never committed.
param postgresAdminPassword = readEnvironmentVariable('WANDER_PG_ADMIN_PASSWORD', '')

// Provider keys, supplied at deploy time from env/CI secrets; never committed. Empty => fake providers.
param mapboxAccessToken = readEnvironmentVariable('WANDER_MAPBOX_TOKEN', '')
param azureMapsKey = readEnvironmentVariable('WANDER_AZURE_MAPS_KEY', '')

// Entra External ID values for the staging environment (non-secret).
param authAuthority = 'https://wander-staging.ciamlogin.com/wander-staging.onmicrosoft.com/v2.0'
param authAudience = 'api://wander-api-staging'

// Staging mirrors dev SKUs to keep costs low until prod hardening, but enables Redis so the
// distributed-cache path is exercised before prod.
param appServiceSku = 'B1'
param postgresSku = 'Standard_B1ms'
param postgresTier = 'Burstable'
param deployRedis = true
param redisSkuName = 'Balanced_B0'
