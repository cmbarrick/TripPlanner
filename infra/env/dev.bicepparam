using '../main.bicep'

param environmentName = 'dev'
param location = 'eastus2'

// Supplied at deploy time from a CI secret; never committed.
param postgresAdminPassword = readEnvironmentVariable('WANDER_PG_ADMIN_PASSWORD', '')

// Entra External ID values for the dev environment (non-secret).
param authAuthority = 'https://wander-dev.ciamlogin.com/wander-dev.onmicrosoft.com/v2.0'
param authAudience = 'api://wander-api-dev'

// Cost-optimised dev SKUs (defaults, listed here for clarity).
param appServiceSku = 'B1'
param postgresSku = 'Standard_B1ms'
param postgresTier = 'Burstable'

// Azure Managed Redis has no cheap tier (~$45/mo); dev runs without it and uses the API's
// in-process distributed cache. Flip to true to exercise Redis in dev.
param deployRedis = false
param redisSkuName = 'Balanced_B0'
