// Linux Consumption Function App (.NET 9 isolated) hosting Wander's background worker — today the
// voice-note transcription function. Reuses the media storage account for its runtime storage.
// Hierarchical config keys use '__' (the App Service/Linux convention; maps to ':' in .NET config).

@description('Function App name (globally unique).')
param functionAppName string

@description('Consumption plan name.')
param planName string

param location string

@description('Media/runtime storage account connection string.')
@secure()
param storageConnectionString string

param speechEndpoint string

@secure()
param speechKey string

@description('Base URL of the API the Function posts transcripts back to.')
param apiBaseUrl string

@description('Shared key matching the API Functions:CallbackKey.')
@secure()
param callbackKey string

param appInsightsConnectionString string

param mediaContainer string = 'media'

@description('File share name for Consumption content (lowercase, <= 60 chars).')
param contentShareName string

param tags object = {}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  tags: tags
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  kind: 'functionapp'
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOTNET-ISOLATED|9.0'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'dotnet-isolated'
        }
        {
          name: 'AzureWebJobsStorage'
          value: storageConnectionString
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: storageConnectionString
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: contentShareName
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'MediaStorage'
          value: storageConnectionString
        }
        {
          name: 'Storage__MediaContainer'
          value: mediaContainer
        }
        {
          name: 'Speech__Endpoint'
          value: speechEndpoint
        }
        {
          name: 'Speech__Key'
          value: speechKey
        }
        {
          name: 'Api__BaseUrl'
          value: apiBaseUrl
        }
        {
          name: 'Api__CallbackKey'
          value: callbackKey
        }
      ]
    }
  }
}

output principalId string = functionApp.identity.principalId
output defaultHostName string = functionApp.properties.defaultHostName
output functionAppName string = functionApp.name
