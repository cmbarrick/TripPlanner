// Wander — environment topology (Phase 3).
//
// Subscription-scoped deployment: creates the per-environment resource group and all
// resources inside it. Deploy with:
//   az deployment sub create --location eastus2 \
//     --template-file infra/main.bicep --parameters infra/env/dev.bicepparam
//
// No secrets are committed. Postgres admin password is supplied at deploy time
// (the .bicepparam reads it from an environment variable). Provider keys are created
// as EMPTY Key Vault placeholders and filled out-of-band — see infra/README.md.

targetScope = 'subscription'

@description('Environment short name: dev | staging | prod.')
@allowed([
  'dev'
  'staging'
  'prod'
])
param environmentName string

@description('Azure region for all resources.')
param location string = 'eastus2'

@description('Base name used in all resource names.')
param namePrefix string = 'wander'

@description('PostgreSQL administrator login.')
param postgresAdminLogin string = 'wanderadmin'

@description('PostgreSQL administrator password (supplied at deploy time; never committed).')
@secure()
param postgresAdminPassword string

@description('Entra External ID authority (issuer) URL for this environment.')
param authAuthority string

@description('Entra External ID API audience for this environment.')
param authAudience string

// --- SKUs (overridden per environment in the .bicepparam files) ---
@description('App Service plan SKU.')
param appServiceSku string = 'B1'

@description('PostgreSQL Flexible Server compute SKU.')
param postgresSku string = 'Standard_B1ms'

@description('PostgreSQL Flexible Server tier.')
@allowed([
  'Burstable'
  'GeneralPurpose'
  'MemoryOptimized'
])
param postgresTier string = 'Burstable'

@description('Redis SKU name.')
@allowed([
  'Basic'
  'Standard'
  'Premium'
])
param redisSkuName string = 'Basic'

@description('Redis SKU family (C = Basic/Standard, P = Premium).')
param redisSkuFamily string = 'C'

@description('Redis SKU capacity (0 = 250 MB on C family).')
param redisSkuCapacity int = 0

// Short, deterministic suffix for resources that need a globally unique name.
var suffix = take(uniqueString(subscription().id, environmentName), 6)

var rgName = 'rg-${namePrefix}-${environmentName}'
var planName = 'plan-${namePrefix}-${environmentName}'
var appName = 'app-${namePrefix}-${environmentName}-${suffix}'
var pgName = 'psql-${namePrefix}-${environmentName}-${suffix}'
var redisName = 'redis-${namePrefix}-${environmentName}-${suffix}'
// Key Vault names are capped at 24 chars, so use a shortened prefix.
var kvName = 'kv-wndr-${environmentName}-${suffix}'
var swaName = 'swa-${namePrefix}-${environmentName}'
var logName = 'log-${namePrefix}-${environmentName}'
var aiName = 'appi-${namePrefix}-${environmentName}'

var commonTags = {
  app: namePrefix
  env: environmentName
  managedBy: 'bicep'
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgName
  location: location
  tags: commonTags
}

module monitoring 'modules/monitoring.bicep' = {
  scope: rg
  name: 'monitoring'
  params: {
    logAnalyticsName: logName
    appInsightsName: aiName
    location: location
    tags: commonTags
  }
}

module postgres 'modules/postgres.bicep' = {
  scope: rg
  name: 'postgres'
  params: {
    serverName: pgName
    location: location
    administratorLogin: postgresAdminLogin
    administratorPassword: postgresAdminPassword
    skuName: postgresSku
    skuTier: postgresTier
    tags: commonTags
  }
}

module redis 'modules/redis.bicep' = {
  scope: rg
  name: 'redis'
  params: {
    redisName: redisName
    location: location
    skuName: redisSkuName
    skuFamily: redisSkuFamily
    skuCapacity: redisSkuCapacity
    tags: commonTags
  }
}

module staticWebApp 'modules/staticWebApp.bicep' = {
  scope: rg
  name: 'staticWebApp'
  params: {
    name: swaName
    location: location
    tags: commonTags
  }
}

module keyVault 'modules/keyVault.bicep' = {
  scope: rg
  name: 'keyVault'
  params: {
    keyVaultName: kvName
    location: location
    tags: commonTags
    dbConnectionString: postgres.outputs.connectionString
    redisConnectionString: redis.outputs.connectionString
    appInsightsConnectionString: monitoring.outputs.connectionString
  }
}

module appService 'modules/appService.bicep' = {
  scope: rg
  name: 'appService'
  params: {
    planName: planName
    appName: appName
    location: location
    appServiceSku: appServiceSku
    keyVaultName: kvName
    authAuthority: authAuthority
    authAudience: authAudience
    webOrigin: 'https://${staticWebApp.outputs.defaultHostname}'
    tags: commonTags
  }
  // App settings reference Key Vault secrets, so the secrets must already exist.
  dependsOn: [
    keyVault
  ]
}

// Grant the App Service managed identity read access to Key Vault secrets.
module kvAccess 'modules/keyVaultRoleAssignment.bicep' = {
  scope: rg
  name: 'kvAccess'
  params: {
    keyVaultName: kvName
    principalId: appService.outputs.principalId
  }
  dependsOn: [
    keyVault
  ]
}

output resourceGroupName string = rg.name
output apiHostName string = appService.outputs.defaultHostName
output apiName string = appName
output webHostName string = staticWebApp.outputs.defaultHostname
output keyVaultName string = kvName
output postgresServerName string = pgName
output postgresFqdn string = postgres.outputs.fullyQualifiedDomainName
output postgresAdminLogin string = postgresAdminLogin
