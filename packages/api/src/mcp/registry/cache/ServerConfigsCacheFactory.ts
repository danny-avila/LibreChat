import { cacheConfig } from '~/cache';
import { ServerConfigsCacheInMemory } from './ServerConfigsCacheInMemory';
import { ServerConfigsCacheRedis } from './ServerConfigsCacheRedis';

export type ServerConfigsCache = ServerConfigsCacheInMemory | ServerConfigsCacheRedis;

/**
 * Factory for creating the appropriate ServerConfigsCache implementation based on deployment mode.
 * Automatically selects between in-memory and Redis-backed storage depending on USE_REDIS config.
 * In single-instance mode (USE_REDIS=false), returns lightweight in-memory cache.
 * In cluster mode (USE_REDIS=true), returns Redis-backed cache with distributed coordination.
 * Provides a unified interface regardless of the underlying storage mechanism.
 */
export class ServerConfigsCacheFactory {
  /**
   * Create a ServerConfigsCache instance.
   * Returns Redis implementation if Redis is configured, otherwise in-memory implementation.
   *
   * @param namespace - The namespace for the cache (e.g., 'App') - only used for Redis namespacing
   * @param leaderOnly - Whether operations should only be performed by the leader (only applies to Redis)
   * @returns ServerConfigsCache instance
   */
  static create(namespace: string, leaderOnly: boolean): ServerConfigsCache {
    if (cacheConfig.USE_REDIS) {
      return new ServerConfigsCacheRedis(namespace, leaderOnly);
    }

    // In-memory mode uses a simple Map - doesn't need namespace
    return new ServerConfigsCacheInMemory();
  }
}
