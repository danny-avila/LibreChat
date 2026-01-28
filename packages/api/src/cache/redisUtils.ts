import type { RedisClientType, RedisClusterType } from '@redis/client';
import { logger } from '@librechat/data-schemas';
import { cacheConfig } from './cacheConfig';

/**
 * Efficiently deletes multiple Redis keys with support for both cluster and single-node modes.
 *
 * - Cluster mode: Deletes keys in parallel chunks to avoid CROSSSLOT errors
 * - Single-node mode: Uses batch DEL commands for efficiency
 *
 * @param client - Redis client (node or cluster)
 * @param keys - Array of keys to delete
 * @param chunkSize - Optional chunk size (defaults to REDIS_DELETE_CHUNK_SIZE config)
 * @returns Number of keys deleted
 *
 * @example
 * ```typescript
 * const deletedCount = await batchDeleteKeys(keyvRedisClient, ['key1', 'key2', 'key3']);
 * console.log(`Deleted ${deletedCount} keys`);
 * ```
 */
export async function batchDeleteKeys(
  client: RedisClientType | RedisClusterType,
  keys: string[],
  chunkSize?: number,
): Promise<number> {
  const startTime = Date.now();

  if (keys.length === 0) {
    return 0;
  }

  const size = chunkSize ?? cacheConfig.REDIS_DELETE_CHUNK_SIZE;
  const mode = cacheConfig.USE_REDIS_CLUSTER ? 'cluster' : 'single-node';
  const deletePromises = [];

  if (cacheConfig.USE_REDIS_CLUSTER) {
    // Cluster mode: Delete each key individually in parallel chunks to avoid CROSSSLOT errors
    for (let i = 0; i < keys.length; i += size) {
      const chunk = keys.slice(i, i + size);
      deletePromises.push(Promise.all(chunk.map((key) => client.del(key))));
    }
  } else {
    // Single-node mode: Batch delete chunks using DEL with array
    for (let i = 0; i < keys.length; i += size) {
      const chunk = keys.slice(i, i + size);
      deletePromises.push(client.del(chunk));
    }
  }

  const results = await Promise.all(deletePromises);

  // Sum up deleted counts (cluster returns array of individual counts, single-node returns total)
  const deletedCount = results.reduce((sum: number, count: number | number[]): number => {
    if (Array.isArray(count)) {
      return sum + count.reduce((a, b) => a + b, 0);
    }
    return sum + count;
  }, 0);

  // Performance monitoring
  const duration = Date.now() - startTime;
  const batchCount = deletePromises.length;

  if (duration > 1000) {
    logger.warn(
      `[Redis][batchDeleteKeys] Slow operation - Duration: ${duration}ms, Mode: ${mode}, Keys: ${keys.length}, Deleted: ${deletedCount}, Batches: ${batchCount}, Chunk size: ${size}`,
    );
  } else {
    logger.debug(
      `[Redis][batchDeleteKeys] Duration: ${duration}ms, Mode: ${mode}, Keys: ${keys.length}, Deleted: ${deletedCount}, Batches: ${batchCount}`,
    );
  }

  return deletedCount;
}

/**
 * Scans Redis for keys matching a pattern and collects them into an array.
 * Uses Redis SCAN to avoid blocking the server.
 *
 * @param client - Redis client (node or cluster) with scanIterator support
 * @param pattern - Pattern to match keys (e.g., 'user:*', 'session:*:active')
 * @param count - Optional SCAN COUNT hint (defaults to REDIS_SCAN_COUNT config)
 * @returns Array of matching keys
 *
 * @example
 * ```typescript
 * const userKeys = await scanKeys(keyvRedisClient, 'user:*');
 * const sessionKeys = await scanKeys(keyvRedisClient, 'session:*:active', 500);
 * ```
 */
export async function scanKeys(
  client: RedisClientType | RedisClusterType,
  pattern: string,
  count?: number,
): Promise<string[]> {
  const startTime = Date.now();
  const keys: string[] = [];

  // Type guard to check if client has scanIterator
  if (!('scanIterator' in client)) {
    throw new Error('Redis client does not support scanIterator');
  }

  const scanCount = count ?? cacheConfig.REDIS_SCAN_COUNT;

  for await (const key of client.scanIterator({
    MATCH: pattern,
    COUNT: scanCount,
  })) {
    keys.push(key);
  }

  // Performance monitoring
  const duration = Date.now() - startTime;

  if (duration > 1000) {
    logger.warn(
      `[Redis][scanKeys] Slow operation - Duration: ${duration}ms, Pattern: "${pattern}", Keys found: ${keys.length}, Scan count: ${scanCount}`,
    );
  } else {
    logger.debug(
      `[Redis][scanKeys] Duration: ${duration}ms, Pattern: "${pattern}", Keys found: ${keys.length}`,
    );
  }

  return keys;
}
