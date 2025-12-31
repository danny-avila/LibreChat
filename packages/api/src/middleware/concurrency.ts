import { logger } from '@librechat/data-schemas';
import { CacheKeys, Time, ViolationTypes } from 'librechat-data-provider';
import { standardCache, cacheConfig } from '~/cache';
import { isEnabled, math } from '~/utils';

const { USE_REDIS } = cacheConfig;

const LIMIT_CONCURRENT_MESSAGES = process.env.LIMIT_CONCURRENT_MESSAGES;
const CONCURRENT_MESSAGE_MAX = math(process.env.CONCURRENT_MESSAGE_MAX, 2);
const CONCURRENT_VIOLATION_SCORE = math(process.env.CONCURRENT_VIOLATION_SCORE, 1);

/** Lazily initialized cache for pending requests */
let pendingReqCache: ReturnType<typeof standardCache> | null = null;

/**
 * Get or create the pending requests cache.
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
 */
function buildKey(userId: string): string {
  const namespace = CacheKeys.PENDING_REQ;
  return `${USE_REDIS ? namespace : ''}:${userId}`;
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
 * @param userId - The user's ID
 * @returns Object with `allowed` (boolean), `pendingRequests` (current count), and `limit`
 */
export async function checkAndIncrementPendingRequest(
  userId: string,
): Promise<PendingRequestResult> {
  const cache = getPendingReqCache();
  const limit = Math.max(CONCURRENT_MESSAGE_MAX, 1);

  if (!cache) {
    return { allowed: true, pendingRequests: 0, limit };
  }

  if (!userId) {
    logger.warn('[concurrency] checkAndIncrementPendingRequest called without userId');
    return { allowed: true, pendingRequests: 0, limit };
  }

  const key = buildKey(userId);
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
 * @param userId - The user's ID
 */
export async function decrementPendingRequest(userId: string): Promise<void> {
  try {
    const cache = getPendingReqCache();

    if (!cache) {
      return;
    }

    if (!userId) {
      logger.warn('[concurrency] decrementPendingRequest called without userId');
      return;
    }

    const key = buildKey(userId);
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
