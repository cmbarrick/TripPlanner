// Azure OpenAI (Cognitive Services) — backs the Phase 5 planning assistant.
// Creates the account plus chat (gpt-4o) and draft (gpt-4o-mini deployment name; model gpt-4.1-mini).

@description('Azure OpenAI account name (globally unique, alphanumeric + hyphens).')
param openAiAccountName string

param location string

param tags object = {}

@description('Chat deployment name (stronger model). Must match Ai:ChatDeployment on the API.')
param chatDeploymentName string = 'gpt-4o'

@description('Draft deployment name (cheaper model). Must match Ai:DraftDeployment on the API.')
param draftDeploymentName string = 'gpt-4o-mini'

@description('Tokens-per-minute capacity for each deployment (dev default is small).')
param deploymentCapacity int = 10

resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: openAiAccountName
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: openAiAccountName
    publicNetworkAccess: 'Enabled'
  }
}

resource draftDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAi
  name: draftDeploymentName
  sku: {
    name: 'Standard'
    capacity: deploymentCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4.1-mini'
      version: '2025-04-14'
    }
  }
}

resource chatDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAi
  name: chatDeploymentName
  sku: {
    name: 'Standard'
    capacity: deploymentCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o'
      version: '2024-11-20'
    }
  }
  dependsOn: [
    draftDeployment
  ]
}

output endpoint string = openAi.properties.endpoint

@secure()
output key string = openAi.listKeys().key1

output accountName string = openAi.name
