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

/** Namespace for admin-defined config-override MCP server inspection results. */
export const CONFIG_CACHE_NAMESPACE = 'Config' as const;

/** Namespaces that use the aggregate-key optimization to avoid SCAN+N-GETs stalls. */
const AGGREGATE_KEY_NAMESPACES = new Set<string>([APP_CACHE_NAMESPACE, CONFIG_CACHE_NAMESPACE]);

/**
 * Factory for creating the appropriate ServerConfigsCache implementation based on
 * deployment mode and namespace.
 *
 * Namespaces in {@link AGGREGATE_KEY_NAMESPACES} use {@link ServerConfigsCacheRedisAggregateKey}
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
   * @param namespace - The namespace for the cache. Namespaces in {@link AGGREGATE_KEY_NAMESPACES}
   *   use aggregate-key Redis storage (or in-memory when Redis is disabled).
   * @param leaderOnly - Whether write operations should only be performed by the leader.
   * @returns ServerConfigsCache instance
   */
  static create(namespace: string, leaderOnly: boolean): ServerConfigsCache {
    if (!cacheConfig.USE_REDIS) {
      return new ServerConfigsCacheInMemory();
    }

    if (AGGREGATE_KEY_NAMESPACES.has(namespace)) {
      return new ServerConfigsCacheRedisAggregateKey(namespace, leaderOnly);
    }

    return new ServerConfigsCacheRedis(namespace, leaderOnly);
  }
}
