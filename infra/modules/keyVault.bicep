// Azure Key Vault — holds all environment secrets (RBAC-authorized).
//
// Generated secrets (DB, Redis, App Insights) are written at deploy time from other
// resources. Provider keys (Mapbox, Azure Maps) are created as EMPTY placeholders so the
// App Service Key Vault references resolve; an empty value makes the API fall back to its
// Fake/no-key provider seam. Fill them out-of-band — see infra/README.md.

@description('Key Vault name (globally unique, max 24 chars).')
param keyVaultName string

param location string
param tags object = {}

@secure()
param dbConnectionString string

@description('Whether to create the Redis connection-string secret (only when Managed Redis is deployed).')
param deployRedisSecret bool = true

@secure()
param redisConnectionString string = ''

param appInsightsConnectionString string

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

resource dbSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'ConnectionStrings--DefaultConnection'
  properties: {
    value: dbConnectionString
  }
}

resource redisSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (deployRedisSecret) {
  parent: keyVault
  name: 'Cache--RedisConnectionString'
  properties: {
    value: redisConnectionString
  }
}

resource appInsightsSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'ApplicationInsights--ConnectionString'
  properties: {
    value: appInsightsConnectionString
  }
}

resource mapboxSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'Places--MapboxAccessToken'
  properties: {
    value: ''
  }
}

resource azureMapsSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'Routing--AzureMapsKey'
  properties: {
    value: ''
  }
}

output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
