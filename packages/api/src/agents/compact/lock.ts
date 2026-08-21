import { randomUUID } from 'crypto';
import { logger } from '@librechat/data-schemas';
import { CacheKeys } from 'librechat-data-provider';
import { cacheConfig, instrumentIORedisClient, ioredisClient } from '~/cache';

/** Releases only when this caller still owns the lease, so a lock that expired
 *  and was re-taken by someone else is never dropped by the previous holder. */
const RELEASE_IF_OWNER =
  'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0';

export interface CompactionLock {
  /** Call once the guarded work is done, in a `finally`. */
  release: () => Promise<void>;
}

/**
 * Claims a conversation for the duration of one compaction.
 *
 * Uses `SET NX PX` with an ownership token, the same primitive the MCP catalog
 * and leader election use: a `get`-then-`set` pair has no compare-and-set
 * semantics, so two compactions arriving together would both see an empty key
 * and both proceed. Returns `null` when another holder has the conversation.
 *
 * Without Redis there is nothing to serialize against beyond this process, and
 * a single-process deployment cannot run two of these concurrently through the
 * route's own `await` points; the claim degrades to a no-op lease rather than
 * failing the request, matching how the concurrency limiter treats its
 * in-memory fallback.
 */
export async function acquireCompactionLock(
  conversationId: string,
  ttlMs: number,
): Promise<CompactionLock | null> {
  if (!cacheConfig.USE_REDIS || !ioredisClient) {
    return { release: async () => {} };
  }
  const key = `${CacheKeys.PENDING_REQ}:compact:${conversationId}`;
  const token = randomUUID();
  const redis = instrumentIORedisClient(ioredisClient, CacheKeys.PENDING_REQ);
  try {
    if ((await redis.set(key, token, 'PX', ttlMs, 'NX')) !== 'OK') {
      return null;
    }
  } catch (error) {
    /** Fail open, as the concurrency limiter does: a cache outage should not
     *  make compaction unavailable, and the post-call tail check still keeps a
     *  raced summary from being persisted. */
    logger.error('[compact] Could not claim the compaction lock', error);
    return { release: async () => {} };
  }
  return {
    release: async () => {
      try {
        await redis.eval(RELEASE_IF_OWNER, 1, key, token);
      } catch (error) {
        logger.warn('[compact] Could not release the compaction lock', error);
      }
    },
  };
}
