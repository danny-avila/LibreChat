import { cacheConfig } from '~/cache';

import { PrivateServerConfigsCacheInMemory } from './PrivateServerConfigsCacheInMemory';
import { PrivateServerConfigsCacheRedis } from './PrivateServerConfigsCacheRedis';

export type PrivateServerConfigsCache =
  | PrivateServerConfigsCacheInMemory
  | PrivateServerConfigsCacheRedis;

/**
 * Factory for creating the appropriate PrivateServerConfigsCache implementation based on deployment mode.
 * Automatically selects between in-memory and Redis-backed storage depending on USE_REDIS config.
 * In single-instance mode (USE_REDIS=false), returns lightweight in-memory cache.
 * In cluster mode (USE_REDIS=true), returns Redis-backed cache with distributed coordination.
 * Provides a unified interface regardless of the underlying storage mechanism.
 */
export class PrivateServerConfigsCacheFactory {
  /**
   * Create a ServerConfigsCache instance.
   * Returns Redis implementation if Redis is configured, otherwise in-memory implementation.
   *
   * @returns PrivateServerConfigsCache instance
   */
  static create(): PrivateServerConfigsCache {
    if (cacheConfig.USE_REDIS) {
      return new PrivateServerConfigsCacheRedis();
    }

    // In-memory mode uses a simple Map - doesn't need owner/namespace
    return new PrivateServerConfigsCacheInMemory();
  }
}
