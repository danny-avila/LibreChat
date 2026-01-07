import { logger } from '@librechat/data-schemas';
import { CacheKeys, Time, ViolationTypes } from 'librechat-data-provider';
import { standardCache, cacheConfig, ioredisClient } from '~/cache';
import { isEnabled, math } from '~/utils';

const { USE_REDIS } = cacheConfig;

const LIMIT_CONCURRENT_MESSAGES = process.env.LIMIT_CONCURRENT_MESSAGES;
const CONCURRENT_MESSAGE_MAX = math(process.env.CONCURRENT_MESSAGE_MAX, 2);
const CONCURRENT_VIOLATION_SCORE = math(process.env.CONCURRENT_VIOLATION_SCORE, 1);

/** Lazily initialized cache for pending requests (used only for in-memory fallback) */
let pendingReqCache: ReturnType<typeof standardCache> | null = null;

/**
 * Get or create the pending requests cache for in-memory fallback.
 * Uses lazy initialization to avoid creating cache before app is ready.
 */
function getPendingReqCache(): ReturnType<typeof standardCache> | null {
  if (!isEnabled(LIMIT_CONCURRENT_MESSAGES)) {
    return null;
  }
  if (!pendingReqCache) {
    pendingReqCache = standardCache(CacheKeys.PENDING_REQ);
  }
  return pendingReqCache;
}

/**
 * Build the cache key for a user's pending requests.
 * Note: ioredisClient already has keyPrefix applied, so we only add namespace:userId
 */
function buildKey(userId: string): string {
  const namespace = CacheKeys.PENDING_REQ;
  return `${namespace}:${userId}`;
}

/**
 * Build the cache key for in-memory fallback (Keyv).
 */
function buildMemoryKey(userId: string): string {
  return `:${userId}`;
}

export interface PendingRequestResult {
  allowed: boolean;
  pendingRequests: number;
  limit: number;
}

export interface ViolationInfo {
  type: string;
  limit: number;
  pendingRequests: number;
  score: number;
}

/**
 * Check if a user can make a new concurrent request and increment the counter if allowed.
 * This is designed for resumable streams where the HTTP response lifecycle doesn't match
 * the actual request processing lifecycle.
 *
 * When Redis is available, uses atomic INCR to prevent race conditions.
 * Falls back to non-atomic get/set for in-memory cache.
 *
 * @param userId - The user's ID
 * @returns Object with `allowed` (boolean), `pendingRequests` (current count), and `limit`
 */
export async function checkAndIncrementPendingRequest(
  userId: string,
): Promise<PendingRequestResult> {
  const limit = Math.max(CONCURRENT_MESSAGE_MAX, 1);

  if (!isEnabled(LIMIT_CONCURRENT_MESSAGES)) {
    return { allowed: true, pendingRequests: 0, limit };
  }

  if (!userId) {
    logger.warn('[concurrency] checkAndIncrementPendingRequest called without userId');
    return { allowed: true, pendingRequests: 0, limit };
  }

  // Use atomic Redis INCR when available to prevent race conditions
  if (USE_REDIS && ioredisClient) {
    const key = buildKey(userId);
    try {
      // Pipeline ensures INCR and EXPIRE execute atomically in one round-trip
      // This prevents edge cases where crash between operations leaves key without TTL
      const pipeline = ioredisClient.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, 60);
      const results = await pipeline.exec();

      if (!results || results[0][0]) {
        throw new Error('Pipeline execution failed');
      }

      const newCount = results[0][1] as number;

      if (newCount > limit) {
        // Over limit - decrement back and reject
        await ioredisClient.decr(key);
        logger.debug(
          `[concurrency] User ${userId} exceeded concurrent limit: ${newCount}/${limit}`,
        );
        return { allowed: false, pendingRequests: newCount, limit };
      }

      logger.debug(
        `[concurrency] User ${userId} incremented pending requests: ${newCount}/${limit}`,
      );
      return { allowed: true, pendingRequests: newCount, limit };
    } catch (error) {
      logger.error('[concurrency] Redis atomic increment failed:', error);
      // On Redis error, allow the request to proceed (fail-open)
      return { allowed: true, pendingRequests: 0, limit };
    }
  }

  // Fallback: non-atomic in-memory cache (race condition possible but acceptable for in-memory)
  const cache = getPendingReqCache();
  if (!cache) {
    return { allowed: true, pendingRequests: 0, limit };
  }

  const key = buildMemoryKey(userId);
  const pendingRequests = +((await cache.get(key)) ?? 0);

  if (pendingRequests >= limit) {
    logger.debug(
      `[concurrency] User ${userId} exceeded concurrent limit: ${pendingRequests}/${limit}`,
    );
    return { allowed: false, pendingRequests, limit };
  }

  await cache.set(key, pendingRequests + 1, Time.ONE_MINUTE);
  logger.debug(
    `[concurrency] User ${userId} incremented pending requests: ${pendingRequests + 1}/${limit}`,
  );

  return { allowed: true, pendingRequests: pendingRequests + 1, limit };
}

/**
 * Decrement the pending request counter for a user.
 * Should be called when a generation job completes, errors, or is aborted.
 *
 * This function handles errors internally and will never throw - it's a cleanup
 * operation that should not interrupt the main flow if cache operations fail.
 *
 * When Redis is available, uses atomic DECR to prevent race conditions.
 * Falls back to non-atomic get/set for in-memory cache.
 *
 * @param userId - The user's ID
 */
export async function decrementPendingRequest(userId: string): Promise<void> {
  try {
    if (!isEnabled(LIMIT_CONCURRENT_MESSAGES)) {
      return;
    }

    if (!userId) {
      logger.warn('[concurrency] decrementPendingRequest called without userId');
      return;
    }

    // Use atomic Redis DECR when available
    if (USE_REDIS && ioredisClient) {
      const key = buildKey(userId);
      try {
        const newCount = await ioredisClient.decr(key);
        if (newCount < 0) {
          // Counter went negative - reset to 0 and delete
          await ioredisClient.del(key);
          logger.debug(`[concurrency] User ${userId} pending requests cleared (was negative)`);
        } else if (newCount === 0) {
          // Clean up zero-value keys
          await ioredisClient.del(key);
          logger.debug(`[concurrency] User ${userId} pending requests cleared`);
        } else {
          logger.debug(`[concurrency] User ${userId} decremented pending requests: ${newCount}`);
        }
      } catch (error) {
        logger.error('[concurrency] Redis atomic decrement failed:', error);
      }
      return;
    }

    // Fallback: non-atomic in-memory cache
    const cache = getPendingReqCache();
    if (!cache) {
      return;
    }

    const key = buildMemoryKey(userId);
    const currentReq = +((await cache.get(key)) ?? 0);

    if (currentReq >= 1) {
      await cache.set(key, currentReq - 1, Time.ONE_MINUTE);
      logger.debug(`[concurrency] User ${userId} decremented pending requests: ${currentReq - 1}`);
    } else {
      await cache.delete(key);
      logger.debug(`[concurrency] User ${userId} pending requests cleared (was ${currentReq})`);
    }
  } catch (error) {
    logger.error('[concurrency] Error decrementing pending request:', error);
  }
}

/**
 * Get violation info for logging purposes when a user exceeds the concurrent request limit.
 */
export function getViolationInfo(pendingRequests: number, limit: number): ViolationInfo {
  return {
    type: ViolationTypes.CONCURRENT,
    limit,
    pendingRequests,
    score: CONCURRENT_VIOLATION_SCORE,
  };
}

/**
 * Check if concurrent message limiting is enabled.
 */
export function isConcurrentLimitEnabled(): boolean {
  return isEnabled(LIMIT_CONCURRENT_MESSAGES);
}
