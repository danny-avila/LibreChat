import { randomUUID } from 'crypto';
import { logger } from '@librechat/data-schemas';
import { CacheKeys } from 'librechat-data-provider';
import { cacheConfig, instrumentIORedisClient, ioredisClient } from '~/cache';

/** Renewed for as long as compaction or turn registration holds the lease. */
const CONVERSATION_LOCK_TTL_MS = 180_000;

/** Releases only when this caller still owns the lease, so a lock that expired
 *  and was re-taken by someone else is never dropped by the previous holder. */
const RELEASE_IF_OWNER =
  'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0';

/** Extends only our own lease, for the same reason. */
const RENEW_IF_OWNER =
  'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("PEXPIRE", KEYS[1], ARGV[2]) end return 0';

/** Conversations this process is compacting or registering a turn for. */
const inFlight = new Set<string>();

export interface CompactionLock {
  /** Call once the guarded work is done, in a `finally`. */
  release: () => Promise<void>;
}

/**
 * Claims a conversation for compaction or normal turn registration.
 *
 * Uses `SET NX PX` with an ownership token, the same primitive the MCP catalog
 * and leader election use: a `get`-then-`set` pair has no compare-and-set
 * semantics, so competing operations could both proceed. Returns `null` when busy.
 *
 * Without Redis the claim falls back to a process-local set. Node interleaves
 * async handlers at every `await`, so two requests for the same conversation
 * really can run concurrently in one process; a no-op lease there would let
 * both spend on a provider call and race to save.
 */
export async function acquireCompactionLock(
  conversationId: string,
  ttlMs: number = CONVERSATION_LOCK_TTL_MS,
): Promise<CompactionLock | null> {
  /** Claim locally before the first await, including while Redis is pending. */
  if (inFlight.has(conversationId)) {
    return null;
  }
  inFlight.add(conversationId);
  const releaseLocal = () => {
    inFlight.delete(conversationId);
  };

  if (!cacheConfig.USE_REDIS) {
    return { release: async () => releaseLocal() };
  }
  if (!ioredisClient) {
    releaseLocal();
    throw Object.assign(new Error('Conversation coordination is unavailable. Please retry.'), {
      statusCode: 503,
      code: 'CONVERSATION_LOCK_UNAVAILABLE',
    });
  }
  const key = `${CacheKeys.PENDING_REQ}:compact:${conversationId}`;
  const token = randomUUID();
  const redis = instrumentIORedisClient(ioredisClient, CacheKeys.PENDING_REQ);
  try {
    if ((await redis.set(key, token, 'PX', ttlMs, 'NX')) !== 'OK') {
      releaseLocal();
      return null;
    }
  } catch (error) {
    releaseLocal();
    logger.error('[compact] Could not claim the conversation lock', error);
    throw Object.assign(new Error('Conversation coordination is unavailable. Please retry.'), {
      statusCode: 503,
      code: 'CONVERSATION_LOCK_UNAVAILABLE',
    });
  }
  /**
   * The TTL starts before the message reads, hydration, tokenization and the
   * balance check, so a slow preprocessing step could let it expire while the
   * first provider call is still running and let another instance start a
   * second paid compaction of the same branch. Heartbeating keeps the lease
   * alive for as long as this holder is actually working.
   */
  const heartbeat = setInterval(
    () => {
      redis.eval(RENEW_IF_OWNER, 1, key, token, ttlMs).catch((error) => {
        logger.debug('[compact] Could not renew the compaction lock', error);
      });
    },
    Math.max(1000, Math.floor(ttlMs / 3)),
  );
  /** Never keep the process alive for a lock heartbeat. */
  heartbeat.unref?.();

  return {
    release: async () => {
      clearInterval(heartbeat);
      releaseLocal();
      try {
        await redis.eval(RELEASE_IF_OWNER, 1, key, token);
      } catch (error) {
        logger.warn('[compact] Could not release the compaction lock', error);
      }
    },
  };
}

/** Hands the lease off to the registered job before allowing a compaction. */
export async function withConversationStartLock<T>(
  conversationId: string,
  start: () => Promise<T>,
): Promise<T> {
  const lock = await acquireCompactionLock(conversationId);
  if (!lock) {
    throw Object.assign(
      new Error('Conversation is busy. Please retry after the current operation completes.'),
      { statusCode: 409, code: 'CONVERSATION_BUSY' },
    );
  }
  try {
    return await start();
  } finally {
    await lock.release();
  }
}
