// Azure Cache for Redis — shared distributed cache for the API (architecture §6).

@description('Redis cache name (globally unique).')
param redisName string

param location string

param skuName string = 'Basic'
param skuFamily string = 'C'
param skuCapacity int = 0

param tags object = {}

resource redis 'Microsoft.Cache/redis@2024-11-01' = {
  name: redisName
  location: location
  tags: tags
  properties: {
    sku: {
      name: skuName
      family: skuFamily
      capacity: skuCapacity
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    redisVersion: '6'
  }
}

output hostName string = redis.properties.hostName

@description('StackExchange.Redis connection string for IDistributedCache (stored in Key Vault by the caller).')
@secure()
output connectionString string = '${redis.properties.hostName}:6380,password=${redis.listKeys().primaryKey},ssl=True,abortConnect=False'
