import { cacheConfig } from '~/cache';
import { MCPToolsCacheInMemory } from './MCPToolsCacheInMemory';
import { MCPToolsCacheRedis } from './MCPToolsCacheRedis';
import { IMCPToolsCache } from './IMCPToolsCache';

export class MCPToolsCacheFactory {
  public static create(userId: string): IMCPToolsCache {
    if (cacheConfig.USE_REDIS) {
      return new MCPToolsCacheRedis(userId);
    }
    return new MCPToolsCacheInMemory();
  }
}
