// Azure Static Web Apps — hosting target for the Expo web export.

@description('Static Web App name.')
param name string

@description('Static Web Apps is only available in a subset of regions (eastus2 is supported).')
param location string

param tags object = {}

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    // Build/deploy is driven by the CI pipeline (deployment token), not GitHub linkage here.
    allowConfigFileUpdates: true
  }
}

output defaultHostname string = staticWebApp.properties.defaultHostname
output name string = staticWebApp.name
