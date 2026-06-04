// Media storage for Phase 4 (notes & journaling): a Standard_LRS account holding the media blob
// container (voice-note audio + photos) and the transcription job queue drained by the Function.
// Also doubles as the Function App's runtime storage (AzureWebJobsStorage) to avoid a second account.

@description('Storage account name (globally unique, 3-24 lowercase alphanumerics).')
param storageAccountName string

param location string

@description('Blob container for media assets (audio/photos).')
param mediaContainer string = 'media'

param tags object = {}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource media 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: mediaContainer
  properties: {
    publicAccess: 'None'
  }
}

resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource transcriptionQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: 'transcription-jobs'
}

output accountName string = storage.name

@description('Connection string for blob + queue access (stored as an app setting by the caller).')
@secure()
output connectionString string = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
