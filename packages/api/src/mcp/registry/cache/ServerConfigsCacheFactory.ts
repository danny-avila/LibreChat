import { cacheConfig } from '~/cache';
import { ServerConfigsCacheInMemory } from './ServerConfigsCacheInMemory';
import { ServerConfigsCacheRedis } from './ServerConfigsCacheRedis';

export type ServerConfigsCache = ServerConfigsCacheInMemory | ServerConfigsCacheRedis;

/**
 * Namespace for YAML-loaded app-level MCP configs. Always uses in-memory storage,
 * even when Redis is enabled, because these configs are static and loaded identically
 * on every instance at startup. Avoiding Redis eliminates the costly SCAN + batch-GET
 * pattern that caused 60s+ stalls under concurrent load (see GitHub #11624, #12408).
 */
export const APP_CACHE_NAMESPACE = 'App' as const;

/**
 * Factory for creating the appropriate ServerConfigsCache implementation based on deployment mode.
 *
 * The {@link APP_CACHE_NAMESPACE} namespace always uses in-memory storage. Each process
 * independently populates its own cache via MCPServersInitializer.
 *
 * Other namespaces respect USE_REDIS for distributed coordination in cluster deployments.
 */
export class ServerConfigsCacheFactory {
  /**
   * Create a ServerConfigsCache instance.
   *
   * @param namespace - The namespace for the cache. {@link APP_CACHE_NAMESPACE} always
   *   returns an in-memory implementation. Other namespaces use Redis when enabled.
   * @param leaderOnly - Whether operations should only be performed by the leader.
   *   Ignored when namespace is {@link APP_CACHE_NAMESPACE} (in-memory has no leader concept).
   * @returns ServerConfigsCache instance
   */
  static create(namespace: string, leaderOnly: boolean): ServerConfigsCache {
    if (namespace === APP_CACHE_NAMESPACE) {
      return new ServerConfigsCacheInMemory();
    }

    if (cacheConfig.USE_REDIS) {
      return new ServerConfigsCacheRedis(namespace, leaderOnly);
    }

    return new ServerConfigsCacheInMemory();
  }
}
