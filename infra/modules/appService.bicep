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

param authAuthority string
param authAudience string

@description('Web origin allowed by CORS (the Static Web App URL).')
param webOrigin string

param tags object = {}

var kvSecretUriPrefix = 'https://${keyVaultName}${environment().suffixes.keyvaultDns}/secrets/'

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
      appSettings: [
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
          name: 'ConnectionStrings__DefaultConnection'
          value: '@Microsoft.KeyVault(SecretUri=${kvSecretUriPrefix}ConnectionStrings--DefaultConnection)'
        }
        {
          name: 'Cache__RedisConnectionString'
          value: '@Microsoft.KeyVault(SecretUri=${kvSecretUriPrefix}Cache--RedisConnectionString)'
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
        {
          name: 'Cors__AllowedOrigins__0'
          value: webOrigin
        }
      ]
    }
  }
}

output principalId string = app.identity.principalId
output defaultHostName string = app.properties.defaultHostName
output appName string = app.name
