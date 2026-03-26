import { ServerConfigsCacheRedisAggregateKey } from './ServerConfigsCacheRedisAggregateKey';
import { ServerConfigsCacheInMemory } from './ServerConfigsCacheInMemory';
import { ServerConfigsCacheRedis } from './ServerConfigsCacheRedis';
import { cacheConfig } from '~/cache';

export type ServerConfigsCache =
  | ServerConfigsCacheInMemory
  | ServerConfigsCacheRedis
  | ServerConfigsCacheRedisAggregateKey;

/**
 * Namespace for YAML-loaded app-level MCP configs. When Redis is enabled, uses a single
 * aggregate key instead of per-server keys to avoid the costly SCAN + batch-GET pattern
 * in {@link ServerConfigsCacheRedis.getAll} that caused 60s+ stalls under concurrent
 * load (see GitHub #11624, #12408). When Redis is disabled, uses in-memory storage.
 */
export const APP_CACHE_NAMESPACE = 'App' as const;

/**
 * Factory for creating the appropriate ServerConfigsCache implementation based on
 * deployment mode and namespace.
 *
 * The {@link APP_CACHE_NAMESPACE} namespace uses {@link ServerConfigsCacheRedisAggregateKey}
 * when Redis is enabled — storing all configs under a single key so `getAll()` is one GET
 * instead of SCAN + N GETs. Cross-instance visibility is preserved: reinspection results
 * propagate through Redis automatically.
 *
 * Other namespaces use the standard {@link ServerConfigsCacheRedis} (per-key storage with
 * SCAN-based enumeration) when Redis is enabled.
 */
export class ServerConfigsCacheFactory {
  /**
   * Create a ServerConfigsCache instance.
   *
   * @param namespace - The namespace for the cache. {@link APP_CACHE_NAMESPACE} uses
   *   aggregate-key Redis storage (or in-memory when Redis is disabled).
   * @param leaderOnly - Whether write operations should only be performed by the leader.
   * @returns ServerConfigsCache instance
   */
  static create(namespace: string, leaderOnly: boolean): ServerConfigsCache {
    if (!cacheConfig.USE_REDIS) {
      return new ServerConfigsCacheInMemory();
    }

    if (namespace === APP_CACHE_NAMESPACE) {
      return new ServerConfigsCacheRedisAggregateKey(namespace, leaderOnly);
    }

    return new ServerConfigsCacheRedis(namespace, leaderOnly);
  }
}
