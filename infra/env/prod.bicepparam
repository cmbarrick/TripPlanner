using '../main.bicep'

param environmentName = 'prod'
param location = 'eastus2'

// Supplied at deploy time from a CI secret; never committed.
param postgresAdminPassword = readEnvironmentVariable('WANDER_PG_ADMIN_PASSWORD', '')

// Entra External ID values for the production environment (non-secret).
param authAuthority = 'https://wander.ciamlogin.com/wander.onmicrosoft.com/v2.0'
param authAudience = 'api://wander-api'

// Production SKUs: dedicated compute, general-purpose DB, Standard Redis (HA option later).
param appServiceSku = 'P1v3'
param postgresSku = 'Standard_D2ds_v5'
param postgresTier = 'GeneralPurpose'
param redisSkuName = 'Standard'
param redisSkuFamily = 'C'
param redisSkuCapacity = 1
