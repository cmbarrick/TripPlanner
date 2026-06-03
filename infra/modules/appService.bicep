// API hosting: Linux App Service plan + .NET 9 web app with a system-assigned identity.
// All secrets are pulled from Key Vault via references; non-secret config is set directly.

@description('App Service plan name.')
param planName string

@description('Web App name (globally unique).')
param appName string

param location string
param appServiceSku string = 'B1'

@description('Key Vault name used to build secret references.')
param keyVaultName string

@description('Whether the API should use Redis (adds the Cache:RedisConnectionString Key Vault reference). When false, the API falls back to an in-process distributed cache.')
param useRedis bool = true

param authAuthority string
param authAudience string

@description('Web origin allowed by CORS (the Static Web App URL).')
param webOrigin string

@description('Additional CORS origins (e.g. localhost dev ports for the Expo web client). Appended after webOrigin.')
param extraCorsOrigins array = []

param tags object = {}

var kvSecretUriPrefix = 'https://${keyVaultName}${environment().suffixes.keyvaultDns}/secrets/'

var baseAppSettings = [
  {
    // Cloud always runs as Production so the dev auth bypass + seeding stay off.
    name: 'ASPNETCORE_ENVIRONMENT'
    value: 'Production'
  }
  {
    // Migrations are applied by the deploy pipeline, not on app startup.
    name: 'Database__MigrateOnStartup'
    value: 'false'
  }
  {
    // The .NET cold start on smaller SKUs (B1) can exceed the default 230s warmup-probe
    // limit, which makes `az webapp deploy` report a false "site failed to start". Raise the
    // limit so the (slow) first start finishes within the probe window.
    name: 'WEBSITES_CONTAINER_START_TIME_LIMIT'
    value: '600'
  }
  {
    name: 'ConnectionStrings__DefaultConnection'
    value: '@Microsoft.KeyVault(SecretUri=${kvSecretUriPrefix}ConnectionStrings--DefaultConnection)'
  }
  {
    name: 'ApplicationInsights__ConnectionString'
    value: '@Microsoft.KeyVault(SecretUri=${kvSecretUriPrefix}ApplicationInsights--ConnectionString)'
  }
  {
    name: 'Places__MapboxAccessToken'
    value: '@Microsoft.KeyVault(SecretUri=${kvSecretUriPrefix}Places--MapboxAccessToken)'
  }
  {
    name: 'Routing__AzureMapsKey'
    value: '@Microsoft.KeyVault(SecretUri=${kvSecretUriPrefix}Routing--AzureMapsKey)'
  }
  {
    name: 'Authentication__EntraExternalId__Authority'
    value: authAuthority
  }
  {
    name: 'Authentication__EntraExternalId__Audience'
    value: authAudience
  }
]

// CORS origins are indexed app settings (Cors__AllowedOrigins__N). The Static Web App URL
// is always first; dev environments append localhost ports for the local Expo web client.
var corsOrigins = concat([webOrigin], extraCorsOrigins)
var corsAppSettings = [for (origin, i) in corsOrigins: {
  name: 'Cors__AllowedOrigins__${i}'
  value: origin
}]

// Only wire the Redis connection when Managed Redis is provisioned for this environment;
// otherwise the API falls back to its in-process IDistributedCache (see Program.cs).
var redisAppSettings = useRedis ? [
  {
    name: 'Cache__RedisConnectionString'
    value: '@Microsoft.KeyVault(SecretUri=${kvSecretUriPrefix}Cache--RedisConnectionString)'
  }
] : []

var appSettings = concat(baseAppSettings, corsAppSettings, redisAppSettings)

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  tags: tags
  sku: {
    name: appServiceSku
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|9.0'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      healthCheckPath: '/health'
      appSettings: appSettings
    }
  }
}

output principalId string = app.identity.principalId
output defaultHostName string = app.properties.defaultHostName
output appName string = app.name
