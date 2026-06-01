using '../main.bicep'

param environmentName = 'staging'
param location = 'eastus2'

// Supplied at deploy time from a CI secret; never committed.
param postgresAdminPassword = readEnvironmentVariable('WANDER_PG_ADMIN_PASSWORD', '')

// Entra External ID values for the staging environment (non-secret).
param authAuthority = 'https://wander-staging.ciamlogin.com/wander-staging.onmicrosoft.com/v2.0'
param authAudience = 'api://wander-api-staging'

// Staging mirrors dev SKUs to keep costs low until prod hardening.
param appServiceSku = 'B1'
param postgresSku = 'Standard_B1ms'
param postgresTier = 'Burstable'
param redisSkuName = 'Basic'
param redisSkuFamily = 'C'
param redisSkuCapacity = 0
