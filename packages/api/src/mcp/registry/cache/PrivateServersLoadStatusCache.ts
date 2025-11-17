import { standardCache } from '~/cache';
import { BaseRegistryCache } from './BaseRegistryCache';
import { logger } from '@librechat/data-schemas';

const LOADED_KEY_PREFIX = 'USER_PRIVATE_SERVERS_LOADED';
const LOCK_KEY_PREFIX = 'USER_PRIVATE_SERVERS_LOAD_LOCK';

// Default TTL values (in milliseconds)
const DEFAULT_LOADED_TTL = 3600 * 1000; // 1 hour - should match cache entry TTL
const DEFAULT_LOCK_TTL = 30 * 1000; // 30 seconds - lock timeout
const DEFAULT_WAIT_INTERVAL = 100; // 100ms between checks

/**
 * Dedicated cache for managing private server loading status with TTL synchronization.
 * Solves three critical issues:
 * 1. TTL Synchronization: Loaded flags expire in sync with cache entries
 * 2. Cache Eviction Detection: When cache expires, flag expires too
 * 3. Race Condition Prevention: Distributed locking prevents concurrent loads
 *
 * Design:
 * - Loaded flags have same TTL as cache entries (prevents desync)
 * - Distributed locks prevent multiple processes loading same user
 * - Wait mechanism allows processes to wait for ongoing loads
 * - Works correctly for users with 0 servers (trusts TTL, no cache verification)
 */
class PrivateServersLoadStatusCache extends BaseRegistryCache {
  protected readonly cache = standardCache(`${this.PREFIX}::PrivateServersLoadStatus`);

  /**
   * Check if user's private servers are fully loaded.
   * If false, servers need to be loaded from DB.
   *
   * @param userId - User ID
   * @returns true if user's private servers are fully loaded
   */
  public async isLoaded(userId: string): Promise<boolean> {
    const key = `${LOADED_KEY_PREFIX}::${userId}`;
    return (await this.cache.get(key)) === true;
  }

  /**
   * Mark user's private servers as fully loaded with TTL.
   * TTL MUST match the cache entry TTL to prevent desync.
   *
   * @param userId - User ID
   * @param ttl - Time to live in milliseconds (default: 1 hour)
   */
  public async setLoaded(userId: string, ttl: number = DEFAULT_LOADED_TTL): Promise<void> {
    const key = `${LOADED_KEY_PREFIX}::${userId}`;
    await this.leaderCheck('set private servers loaded status');
    const success = await this.cache.set(key, true, ttl);
    this.successCheck(`set loaded status for user ${userId}`, success);
    logger.debug(`[MCP][LoadStatusCache] Marked user ${userId} as loaded (TTL: ${ttl}ms)`);
  }

  /**
   * Acquire a distributed lock for loading a user's private servers.
   * Prevents concurrent processes from loading the same user's servers.
   *
   * Note: This is not fully atomic due to cache API limitations (check-then-set race),
   * but with leader-only writes, this is sufficient in practice.
   *
   * @param userId - User ID
   * @param ttl - Lock timeout in milliseconds (default: 30s)
   * @returns true if lock acquired, false if already locked
   */
  public async acquireLoadLock(userId: string, ttl: number = DEFAULT_LOCK_TTL): Promise<boolean> {
    const key = `${LOCK_KEY_PREFIX}::${userId}`;
    await this.leaderCheck('acquire load lock');

    // Check if lock already exists
    const existingLock = await this.cache.get(key);
    if (existingLock) {
      logger.debug(`[MCP][LoadStatusCache] Load lock already held for user ${userId}`);
      return false;
    }

    // Try to set the lock with timestamp
    const acquired = await this.cache.set(key, Date.now(), ttl);

    if (acquired) {
      logger.debug(`[MCP][LoadStatusCache] Acquired load lock for user ${userId} (TTL: ${ttl}ms)`);
    }

    return acquired === true;
  }

  /**
   * Release the distributed lock for a user's private server loading.
   * Should be called in a finally block to ensure lock is always released.
   *
   * @param userId - User ID
   */
  public async releaseLoadLock(userId: string): Promise<void> {
    const key = `${LOCK_KEY_PREFIX}::${userId}`;
    await this.leaderCheck('release load lock');
    await this.cache.delete(key);
    logger.debug(`[MCP][LoadStatusCache] Released load lock for user ${userId}`);
  }

  /**
   * Wait for another process to finish loading a user's private servers.
   * Used when a lock is already held by another process.
   *
   * @param userId - User ID
   * @param maxWaitTime - Maximum time to wait in milliseconds (default: 5s)
   * @param checkInterval - Interval between checks in milliseconds (default: 100ms)
   * @returns true if loading completed within maxWaitTime, false if timeout
   */
  public async waitForLoad(
    userId: string,
    maxWaitTime: number = 5000,
    checkInterval: number = DEFAULT_WAIT_INTERVAL,
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const loaded = await this.isLoaded(userId);
      if (loaded) {
        logger.debug(`[MCP][LoadStatusCache] User ${userId} loading completed by another process`);
        return true;
      }

      // Wait before checking again
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    logger.warn(
      `[MCP][LoadStatusCache] Timeout waiting for user ${userId} loading (waited ${maxWaitTime}ms)`,
    );
    return false;
  }

  /**
   * Clear loaded status for a user.
   * Used for testing or manual cache invalidation.
   *
   * @param userId - User ID
   */
  public async clearLoaded(userId: string): Promise<void> {
    const key = `${LOADED_KEY_PREFIX}::${userId}`;
    await this.leaderCheck('clear loaded status');
    await this.cache.delete(key);
    logger.debug(`[MCP][LoadStatusCache] Cleared loaded status for user ${userId}`);
  }
}

export const privateServersLoadStatusCache = new PrivateServersLoadStatusCache();
