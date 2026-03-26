import { cacheConfig } from '~/cache';
import { ServerConfigsCacheInMemory } from './ServerConfigsCacheInMemory';
import { ServerConfigsCacheRedis } from './ServerConfigsCacheRedis';

export type ServerConfigsCache = ServerConfigsCacheInMemory | ServerConfigsCacheRedis;

/**
 * Factory for creating the appropriate ServerConfigsCache implementation based on deployment mode.
 *
 * The 'App' namespace (YAML-loaded configs) always uses in-memory storage, even when Redis is
 * enabled. These configs are static, loaded identically on every instance at startup from
 * librechat.yaml, so there is no benefit to storing them in Redis. Avoiding Redis for this
 * namespace eliminates the costly SCAN + batch-GET pattern in ServerConfigsCacheRedis.getAll()
 * that caused 60s+ stalls under concurrent load (see GitHub issue #11624).
 *
 * Other namespaces respect USE_REDIS for distributed coordination in cluster deployments.
 */
export class ServerConfigsCacheFactory {
  /**
   * Create a ServerConfigsCache instance.
   *
   * @param namespace - The namespace for the cache (e.g., 'App'). The 'App' namespace always
   *   returns an in-memory implementation since its data is static YAML config loaded at startup.
   * @param leaderOnly - Whether operations should only be performed by the leader (only applies to Redis)
   * @returns ServerConfigsCache instance
   */
  static create(namespace: string, leaderOnly: boolean): ServerConfigsCache {
    if (namespace === 'App') {
      return new ServerConfigsCacheInMemory();
    }

    if (cacheConfig.USE_REDIS) {
      return new ServerConfigsCacheRedis(namespace, leaderOnly);
    }

    return new ServerConfigsCacheInMemory();
  }
}
