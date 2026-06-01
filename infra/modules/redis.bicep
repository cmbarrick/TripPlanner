// Azure Managed Redis — shared distributed cache for the API (architecture §6).
//
// Replaces the retired classic "Azure Cache for Redis" (Microsoft.Cache/redis), which can no
// longer be created on new subscriptions. Azure Managed Redis (Microsoft.Cache/redisEnterprise)
// is Redis-protocol compatible, so StackExchange.Redis / IDistributedCache work unchanged.

@description('Managed Redis cluster name (globally unique).')
param redisName string

param location string

@description('Azure Managed Redis SKU. Balanced_B0 is the smallest/cheapest entry tier.')
param skuName string = 'Balanced_B0'

param tags object = {}

resource cluster 'Microsoft.Cache/redisEnterprise@2025-04-01' = {
  name: redisName
  location: location
  tags: tags
  sku: {
    name: skuName
  }
}

resource database 'Microsoft.Cache/redisEnterprise/databases@2025-04-01' = {
  parent: cluster
  name: 'default'
  properties: {
    clientProtocol: 'Encrypted'
    port: 10000
    // Single logical endpoint (non-cluster-aware clients like IDistributedCache work simply).
    clusteringPolicy: 'EnterpriseCluster'
    evictionPolicy: 'NoEviction'
  }
}

output hostName string = cluster.properties.hostName

@description('StackExchange.Redis connection string for IDistributedCache (stored in Key Vault by the caller).')
@secure()
output connectionString string = '${cluster.properties.hostName}:10000,password=${database.listKeys().primaryKey},ssl=True,abortConnect=False'
