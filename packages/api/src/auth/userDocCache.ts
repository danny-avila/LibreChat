import { createHash } from 'crypto';
import { logger } from '@librechat/data-schemas';
import {
  AUTH_USER_DOC_TOMBSTONE_PREFIX,
  AUTH_USER_DOC_EPOCH_PREFIX,
  AUTH_USER_DOC_BY_ID_PREFIX,
  CacheKeys,
} from 'librechat-data-provider';
import type { IUser } from '@librechat/data-schemas';
import { cacheConfig } from '~/cache/cacheConfig';

const AUTH_USER_DOC_CACHE_VERSION = 2;
export const AUTH_USER_DOC_CACHE_TTL_MS = 5000;
/** Must outlive every entry written BEFORE the invalidation that stamped it, so any
 *  such entry is guaranteed to meet the epoch on its next read. */
export const AUTH_USER_DOC_EPOCH_TTL_MS: number = AUTH_USER_DOC_CACHE_TTL_MS * 2;

export type AuthUserDocCacheMode = 'off' | 'on';

export interface AuthUserDocCacheStore {
  get: <T = unknown>(key: string) => Promise<T | undefined>;
  set: (key: string, value: unknown, ttl?: number) => Promise<unknown>;
  delete: (key: string) => Promise<unknown>;
}

export interface AuthUserDocCacheKeyInput {
  strategy: string;
  subject?: string;
  issuer?: string;
  tenantId?: string;
  userId?: string;
  scope?: string;
}

interface CachedAuthUserDoc {
  version: number;
  cachedAt: number;
  user: CachedAuthUser;
}

type CachedAuthUser = Omit<Partial<IUser>, '_id'> & {
  _id?: string;
  id?: string;
};

type UserIdInput = {
  _id?: string | { toString(): string };
  id?: string;
};

let warnedAuthUserDocCacheRequiresRedis = false;

export function getAuthUserDocCacheTtlMs(): number {
  return AUTH_USER_DOC_CACHE_TTL_MS;
}

function isAuthUserDocCacheRedisBacked(): boolean {
  return (
    cacheConfig.USE_REDIS &&
    !cacheConfig.FORCED_IN_MEMORY_CACHE_NAMESPACES?.includes(CacheKeys.AUTH_USER_DOC)
  );
}

export function getAuthUserDocCacheMode(): AuthUserDocCacheMode {
  if (process.env.AUTH_USER_CACHE_MODE !== 'on') {
    return 'off';
  }
  if (!isAuthUserDocCacheRedisBacked()) {
    if (!warnedAuthUserDocCacheRequiresRedis) {
      warnedAuthUserDocCacheRequiresRedis = true;
      logger.warn(
        '[authUserDocCache] User request burst caching requires Redis; disabling auth user cache',
      );
    }
    return 'off';
  }
  return 'on';
}

function normalizeKeyPart(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\/+$/, '');
}

function normalizeExactKeyPart(value: string | undefined): string {
  return (value ?? '').trim();
}

export function buildAuthUserDocCacheKey(input: AuthUserDocCacheKeyInput): string | undefined {
  const strategy = input.strategy.trim();
  const subject = input.subject?.trim();
  if (!strategy || !subject) {
    return undefined;
  }

  const digest = createHash('sha256')
    .update(
      [
        normalizeKeyPart(strategy),
        subject,
        normalizeKeyPart(input.issuer),
        normalizeExactKeyPart(input.tenantId),
        normalizeExactKeyPart(input.userId),
        normalizeKeyPart(input.scope),
      ].join('\0'),
    )
    .digest('base64url');

  return `auth-user-doc:v${AUTH_USER_DOC_CACHE_VERSION}:${digest}`;
}

function getUserId(user: UserIdInput): string | undefined {
  const id = user._id ?? user.id;
  if (id == null) {
    return undefined;
  }
  return typeof id === 'string' ? id : id.toString();
}

export function buildAuthUserDocReverseIndexKey(userId: string): string {
  return `${AUTH_USER_DOC_BY_ID_PREFIX}:${userId}`;
}

export function buildAuthUserDocTombstoneKey(userId: string): string {
  return `${AUTH_USER_DOC_TOMBSTONE_PREFIX}:${userId}`;
}

export function buildAuthUserDocEpochKey(userId: string): string {
  return `${AUTH_USER_DOC_EPOCH_PREFIX}:${userId}`;
}

function sanitizeUserForCache(user: Partial<IUser>): CachedAuthUser {
  const id = getUserId(user);
  const { _id: _ignored, ...rest } = user;
  const sanitized: CachedAuthUser = { ...rest };
  if (id) {
    sanitized._id = id;
    sanitized.id = id;
  }

  delete sanitized.password;
  delete sanitized.refreshToken;
  delete sanitized.totpSecret;
  delete sanitized.pendingTotpSecret;
  delete sanitized.backupCodes;
  delete sanitized.pendingBackupCodes;
  delete sanitized.federatedTokens;
  delete sanitized.openidTokens;

  return sanitized;
}

/** Removes ONE cache key from the user's reverse index, preserving the rest: an
 *  unwind that deleted the whole index left the user's OTHER live entries
 *  undiscoverable, so later mutations and deletions could no longer invalidate
 *  them and a stale document survived to its TTL. */
async function forgetUserCacheKey(
  store: AuthUserDocCacheStore,
  userId: string,
  cacheKey: string,
): Promise<void> {
  const indexKey = buildAuthUserDocReverseIndexKey(userId);
  const existing = await store.get<string[]>(indexKey);
  if (!Array.isArray(existing)) {
    return;
  }
  const remaining = existing.filter((value) => value !== cacheKey);
  if (remaining.length === 0) {
    await store.delete(indexKey);
    return;
  }
  await store.set(indexKey, remaining, AUTH_USER_DOC_CACHE_TTL_MS);
}

async function rememberUserCacheKey(
  store: AuthUserDocCacheStore,
  userId: string,
  cacheKey: string,
  ttlMs: number,
): Promise<void> {
  const indexKey = buildAuthUserDocReverseIndexKey(userId);
  const existing = await store.get<string[]>(indexKey);
  const keys = Array.isArray(existing) ? existing.filter((value) => value !== cacheKey) : [];
  keys.push(cacheKey);
  await store.set(indexKey, keys.slice(-20), ttlMs);
}

export async function getCachedAuthUserDoc(
  store: AuthUserDocCacheStore,
  cacheKey: string,
): Promise<CachedAuthUser | undefined> {
  try {
    const cached = await store.get<CachedAuthUserDoc>(cacheKey);
    if (!cached || cached.version !== AUTH_USER_DOC_CACHE_VERSION || !cached.user) {
      return undefined;
    }
    // EPOCH fence: reject any entry whose Mongo read predates the user's latest
    // invalidation. The reverse index alone cannot guarantee this — its
    // read-modify-write can drop a concurrent fill's key, and an invalidation can
    // land between an entry write and its index write — so an unindexed entry
    // must still die here rather than serve a pre-mutation document to its TTL.
    // An unreadable epoch is a MISS (a miss only costs the Mongo fallback).
    const userId = getUserId(cached.user);
    if (userId) {
      const epoch = await store.get<number>(buildAuthUserDocEpochKey(userId));
      if (epoch != null && Number(epoch) >= cached.cachedAt) {
        await store.delete(cacheKey).catch(() => undefined);
        return undefined;
      }
    }
    return cached.user;
  } catch (error) {
    logger.warn('[authUserDocCache] Cache read failed; falling back to user lookup', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export type AuthUserDocCacheFillResult = 'cached' | 'tombstoned' | 'error';

/**
 * Caches the sanitized user document. Returns 'tombstoned' when the user's
 * deletion barrier rose while this fill was in flight — the entry has been
 * unwound, and the CALLER's user document predates the barrier, so the caller
 * must refuse the authentication too, not just lose the cache entry.
 */
export async function setCachedAuthUserDoc(
  store: AuthUserDocCacheStore,
  cacheKey: string,
  user: Partial<IUser>,
  options?: {
    /** When the caller's Mongo read STARTED. The epoch fence compares invalidations
     *  against this moment, so stamping the (later) write time would let a mutation
     *  that landed mid-read slip under its own epoch. */
    readAt?: number;
  },
): Promise<AuthUserDocCacheFillResult> {
  const sanitized = sanitizeUserForCache(user);
  const userId = getUserId(sanitized);
  let entryWritten = false;
  try {
    await store.set(
      cacheKey,
      {
        version: AUTH_USER_DOC_CACHE_VERSION,
        cachedAt: options?.readAt ?? Date.now(),
        user: sanitized,
      } satisfies CachedAuthUserDoc,
      AUTH_USER_DOC_CACHE_TTL_MS,
    );
    entryWritten = true;
    if (userId) {
      await rememberUserCacheKey(store, userId, cacheKey, AUTH_USER_DOC_CACHE_TTL_MS);
      // Checked AFTER the writes above, never before: the deletion barrier writes
      // its tombstone and then sweeps keys, so a fill whose Mongo read predates the
      // barrier either lands before the sweep (swept) or observes the tombstone
      // here and unwinds itself. A pre-write check leaves the sweep-then-write
      // interleaving serving a deleted user's document for the full TTL.
      const tombstoned = await store.get(buildAuthUserDocTombstoneKey(userId));
      if (tombstoned != null) {
        await store.delete(cacheKey);
        await forgetUserCacheKey(store, userId, cacheKey);
        return 'tombstoned';
      }
    }
    return 'cached';
  } catch (error) {
    logger.warn('[authUserDocCache] Cache write failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    // An entry whose tombstone verification never ran must not survive: the NEXT
    // request would serve it as a fence-conclusive cache hit without reading
    // Mongo, admitting a pre-barrier document for the full TTL. Best-effort —
    // if even the unwind fails, the entry's own TTL bounds the residual, and
    // THIS request still falls back to the durable barrier recheck ('error' is
    // not a conclusive fence).
    if (entryWritten) {
      try {
        await store.delete(cacheKey);
        if (userId) {
          await forgetUserCacheKey(store, userId, cacheKey);
        }
      } catch {
        // TTL-bounded residual; nothing further to do.
      }
    }
    return 'error';
  }
}

export async function invalidateCachedAuthUserDoc(
  store: AuthUserDocCacheStore | undefined,
  input: { userId?: string; cacheKey?: string },
): Promise<void> {
  if (!store) {
    return;
  }
  try {
    // The EPOCH is the correctness fence and goes FIRST: once it lands, every entry
    // whose read predates this invalidation is rejected on its next read, whether or
    // not the index below ever listed it. The key deletes that follow are prompt
    // cleanup, not the guarantee.
    if (input.userId) {
      await store.set(
        buildAuthUserDocEpochKey(input.userId),
        Date.now(),
        AUTH_USER_DOC_EPOCH_TTL_MS,
      );
    }
    const keys = new Set<string>();
    if (input.cacheKey) {
      keys.add(input.cacheKey);
    }
    if (input.userId) {
      const indexKey = buildAuthUserDocReverseIndexKey(input.userId);
      const indexed = await store.get<string[]>(indexKey);
      if (Array.isArray(indexed)) {
        for (const key of indexed) {
          keys.add(key);
        }
      }
      await store.delete(indexKey);
    }
    await Promise.all([...keys].map((key) => store.delete(key)));
  } catch (error) {
    logger.warn('[authUserDocCache] Cache invalidation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
