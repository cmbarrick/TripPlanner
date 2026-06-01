// Azure Database for PostgreSQL — Flexible Server, one per environment.

@description('Flexible Server name (globally unique).')
param serverName string

param location string

@description('Administrator login name.')
param administratorLogin string

@description('Administrator password.')
@secure()
param administratorPassword string

param skuName string = 'Standard_B1ms'
param skuTier string = 'Burstable'

@description('Database name created on the server.')
param databaseName string = 'wander'

param tags object = {}

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: serverName
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: '16'
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    authConfig: {
      passwordAuth: 'Enabled'
      activeDirectoryAuth: 'Disabled'
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: databaseName
}

// Allow access from other Azure services (App Service). For production, prefer VNet
// integration + private endpoints instead — tracked in the runbook hardening notes.
resource allowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: server
  name: 'AllowAllAzureIPs'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

output fullyQualifiedDomainName string = server.properties.fullyQualifiedDomainName

@description('Npgsql connection string for the application (stored in Key Vault by the caller).')
@secure()
output connectionString string = 'Host=${server.properties.fullyQualifiedDomainName};Port=5432;Database=${databaseName};Username=${administratorLogin};Password=${administratorPassword};SSL Mode=Require;Trust Server Certificate=true'
