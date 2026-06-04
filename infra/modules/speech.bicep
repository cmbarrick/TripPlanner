// Azure AI Speech (Cognitive Services) account — backs voice-note transcription via the Speech
// fast-transcription REST API. The Function reads the endpoint + key from its app settings.

@description('Azure AI Speech account name.')
param speechAccountName string

param location string

@description('Speech SKU. S0 is standard pay-as-you-go; F0 is the free tier (one per subscription).')
@allowed([
  'S0'
  'F0'
])
param skuName string = 'S0'

param tags object = {}

resource speech 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: speechAccountName
  location: location
  tags: tags
  kind: 'SpeechServices'
  sku: {
    name: skuName
  }
  properties: {
    customSubDomainName: speechAccountName
    publicNetworkAccess: 'Enabled'
  }
}

output endpoint string = speech.properties.endpoint

@secure()
output key string = speech.listKeys().key1
