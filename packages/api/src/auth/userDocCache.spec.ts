import { Types } from 'mongoose';
import { logger } from '@librechat/data-schemas';
import { CacheKeys } from 'librechat-data-provider';
import {
  AUTH_USER_DOC_CACHE_TTL_MS,
  AUTH_USER_DOC_EPOCH_TTL_MS,
  buildAuthUserDocCacheKey,
  buildAuthUserDocReverseIndexKey,
  buildAuthUserDocTombstoneKey,
  buildAuthUserDocEpochKey,
  getAuthUserDocCacheMode,
  getCachedAuthUserDoc,
  invalidateCachedAuthUserDoc,
  setCachedAuthUserDoc,
} from './userDocCache';
import { cacheConfig } from '~/cache/cacheConfig';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

const ORIGINAL_ENV = {
  AUTH_USER_CACHE_MODE: process.env.AUTH_USER_CACHE_MODE,
};

const ORIGINAL_CACHE_CONFIG = {
  USE_REDIS: cacheConfig.USE_REDIS,
  FORCED_IN_MEMORY_CACHE_NAMESPACES: [...cacheConfig.FORCED_IN_MEMORY_CACHE_NAMESPACES],
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  cacheConfig.USE_REDIS = ORIGINAL_CACHE_CONFIG.USE_REDIS;
  cacheConfig.FORCED_IN_MEMORY_CACHE_NAMESPACES = [
    ...ORIGINAL_CACHE_CONFIG.FORCED_IN_MEMORY_CACHE_NAMESPACES,
  ];
}

function makeStore() {
  const values = new Map<string, unknown>();
  return {
    values,
    get: async <T = unknown>(key: string) => values.get(key) as T | undefined,
    set: jest.fn(async (key: string, value: unknown, _ttl?: number) => {
      values.set(key, value);
      return true;
    }),
    delete: jest.fn(async (key: string) => values.delete(key)),
  };
}

describe('auth user document cache helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    restoreEnv();
  });

  afterAll(() => {
    restoreEnv();
  });

  it('only enables user request burst caching when Redis backs the auth user namespace', () => {
    process.env.AUTH_USER_CACHE_MODE = 'on';
    cacheConfig.USE_REDIS = false;
    expect(getAuthUserDocCacheMode()).toBe('off');
    expect(logger.warn).toHaveBeenCalledWith(
      '[authUserDocCache] User request burst caching requires Redis; disabling auth user cache',
    );

    cacheConfig.USE_REDIS = true;
    cacheConfig.FORCED_IN_MEMORY_CACHE_NAMESPACES = [CacheKeys.AUTH_USER_DOC];
    expect(getAuthUserDocCacheMode()).toBe('off');

    cacheConfig.FORCED_IN_MEMORY_CACHE_NAMESPACES = [CacheKeys.APP_CONFIG];
    expect(getAuthUserDocCacheMode()).toBe('on');

    process.env.AUTH_USER_CACHE_MODE = 'shadow';
    expect(getAuthUserDocCacheMode()).toBe('off');

    process.env.AUTH_USER_CACHE_MODE = 'invalid';
    expect(getAuthUserDocCacheMode()).toBe('off');
  });

  it('builds stable keys from strategy, subject, issuer, tenant, user, and scope', () => {
    const key = buildAuthUserDocCacheKey({
      strategy: ' OpenID-JWT ',
      subject: 'subject-1',
      issuer: 'https://issuer.example.com/',
      tenantId: 'Tenant-A',
      userId: 'User-A',
      scope: ' Org-A ',
    });
    const equivalent = buildAuthUserDocCacheKey({
      strategy: 'openid-jwt',
      subject: 'subject-1',
      issuer: 'https://issuer.example.com',
      tenantId: 'Tenant-A',
      userId: 'User-A',
      scope: 'org-a',
    });
    const otherTenant = buildAuthUserDocCacheKey({
      strategy: 'openid-jwt',
      subject: 'subject-1',
      issuer: 'https://issuer.example.com',
      tenantId: 'Tenant-B',
      userId: 'User-A',
      scope: 'org-a',
    });
    const caseVariantTenant = buildAuthUserDocCacheKey({
      strategy: 'openid-jwt',
      subject: 'subject-1',
      issuer: 'https://issuer.example.com',
      tenantId: 'tenant-a',
      userId: 'User-A',
      scope: 'org-a',
    });
    const otherUser = buildAuthUserDocCacheKey({
      strategy: 'openid-jwt',
      subject: 'subject-1',
      issuer: 'https://issuer.example.com',
      tenantId: 'Tenant-A',
      userId: 'User-B',
      scope: 'org-a',
    });
    const otherScope = buildAuthUserDocCacheKey({
      strategy: 'openid-jwt',
      subject: 'subject-1',
      issuer: 'https://issuer.example.com',
      tenantId: 'Tenant-A',
      userId: 'User-A',
      scope: 'org-b',
    });

    expect(key).toMatch(/^auth-user-doc:v2:/);
    expect(key).toBe(equivalent);
    expect(key).not.toBe(otherTenant);
    expect(key).not.toBe(caseVariantTenant);
    expect(key).not.toBe(otherUser);
    expect(key).not.toBe(otherScope);
    expect(buildAuthUserDocCacheKey({ strategy: '', subject: 'subject-1' })).toBeUndefined();
    expect(buildAuthUserDocCacheKey({ strategy: 'openid-jwt' })).toBeUndefined();
  });

  it('sanitizes sensitive fields and remembers cache keys by user id', async () => {
    const store = makeStore();
    const cacheKey = 'auth-user-doc:v2:key';
    const userId = new Types.ObjectId();

    await setCachedAuthUserDoc(store, cacheKey, {
      _id: userId,
      id: userId.toString(),
      email: 'user@example.com',
      provider: 'openid',
      password: 'secret',
      refreshToken: [{ refreshToken: 'secret' }],
      federatedTokens: { access_token: 'secret' },
      openidTokens: { access_token: 'secret' },
      totpSecret: 'secret',
      backupCodes: [{ codeHash: 'secret', used: false }],
    });

    const cached = store.values.get(cacheKey) as { user: Record<string, unknown> };
    expect(cached.user).toMatchObject({
      _id: userId.toString(),
      id: userId.toString(),
      email: 'user@example.com',
    });
    expect(cached.user.password).toBeUndefined();
    expect(cached.user.refreshToken).toBeUndefined();
    expect(cached.user.federatedTokens).toBeUndefined();
    expect(cached.user.openidTokens).toBeUndefined();
    expect(cached.user.totpSecret).toBeUndefined();
    expect(cached.user.backupCodes).toBeUndefined();

    expect(store.set).toHaveBeenCalledWith(
      cacheKey,
      expect.objectContaining({ version: 2, user: expect.any(Object) }),
      AUTH_USER_DOC_CACHE_TTL_MS,
    );
    expect(store.values.get(buildAuthUserDocReverseIndexKey(userId.toString()))).toEqual([
      cacheKey,
    ]);
    expect(store.set).toHaveBeenCalledWith(
      buildAuthUserDocReverseIndexKey(userId.toString()),
      [cacheKey],
      AUTH_USER_DOC_CACHE_TTL_MS,
    );
  });

  it('unwinds its own write when the deletion tombstone is present', async () => {
    const store = makeStore();
    const userId = new Types.ObjectId();
    const cacheKey = 'auth-user-doc:v1:tombstoned';
    // The deletion barrier writes this BEFORE sweeping keys, so a fill whose Mongo
    // read predates the barrier but whose cache write lands after the sweep must
    // observe it here and delete its own entry — otherwise the deleted user's
    // document is served for the full TTL while the destructive cascade runs.
    store.values.set(buildAuthUserDocTombstoneKey(userId.toString()), Date.now());

    const result = await setCachedAuthUserDoc(store, cacheKey, {
      _id: userId,
      id: userId.toString(),
      email: 'user@example.com',
    });

    expect(store.values.has(cacheKey)).toBe(false);
    expect(store.values.has(buildAuthUserDocReverseIndexKey(userId.toString()))).toBe(false);
    // The caller's own user document predates the barrier too: the strategy must
    // refuse the authentication, not just lose the cache entry.
    expect(result).toBe('tombstoned');
  });

  it('unwinds its own write when the tombstone verification fails', async () => {
    const store = makeStore();
    const userId = new Types.ObjectId();
    const cacheKey = 'auth-user-doc:v1:verify-failed';
    // Entry + reverse index land, then the tombstone read throws: without the
    // unwind the NEXT request serves this entry as a fence-conclusive cache hit
    // without reading Mongo, admitting a pre-barrier document for the full TTL.
    const realGet = store.get;
    store.get = (async (key: string) => {
      if (key.startsWith('auth-user-doc-tombstone:')) {
        throw new Error('redis blip');
      }
      return realGet(key);
    }) as typeof store.get;

    const result = await setCachedAuthUserDoc(store, cacheKey, {
      _id: userId,
      id: userId.toString(),
      email: 'user@example.com',
    });

    expect(result).toBe('error');
    expect(store.values.has(cacheKey)).toBe(false);
    expect(store.values.has(buildAuthUserDocReverseIndexKey(userId.toString()))).toBe(false);
  });

  it("preserves the user's OTHER cache entries when unwinding a failed fill", async () => {
    const store = makeStore();
    const userId = new Types.ObjectId();
    const survivingKey = 'auth-user-doc:v1:other-session';
    const failingKey = 'auth-user-doc:v1:failing-fill';
    // Another live entry for the same user, already indexed.
    store.values.set(survivingKey, { version: 1, cachedAt: Date.now(), user: {} });
    store.values.set(buildAuthUserDocReverseIndexKey(userId.toString()), [survivingKey]);
    const realGet = store.get;
    store.get = (async (key: string) => {
      if (key.startsWith('auth-user-doc-tombstone:')) {
        throw new Error('redis blip');
      }
      return realGet(key);
    }) as typeof store.get;

    await setCachedAuthUserDoc(store, failingKey, {
      _id: userId,
      id: userId.toString(),
      email: 'user@example.com',
    });

    // Deleting the WHOLE index left the surviving entry undiscoverable: later
    // mutations and deletions could no longer invalidate it, so a stale document
    // was served until its TTL. Only the failed fill's key is removed.
    expect(store.values.has(failingKey)).toBe(false);
    expect(store.values.get(buildAuthUserDocReverseIndexKey(userId.toString()))).toEqual([
      survivingKey,
    ]);
    expect(store.values.has(survivingKey)).toBe(true);
  });

  it('deduplicates reverse-index keys and caps the remembered set', async () => {
    const store = makeStore();
    const objectId = new Types.ObjectId();
    const userId = objectId.toString();
    const indexKey = buildAuthUserDocReverseIndexKey(userId);
    store.values.set(
      indexKey,
      Array.from({ length: 20 }, (_value, index) => `existing-key-${index}`),
    );

    await setCachedAuthUserDoc(store, 'existing-key-10', {
      _id: objectId,
      email: 'user@example.com',
    });
    await setCachedAuthUserDoc(store, 'new-key', {
      _id: objectId,
      email: 'user@example.com',
    });

    const indexed = store.values.get(indexKey);
    expect(indexed).toHaveLength(20);
    expect(indexed).not.toContain('existing-key-0');
    expect(indexed).toContain('existing-key-10');
    expect(indexed).toContain('new-key');
  });

  it('returns cached user documents only for the current cache version', async () => {
    const store = makeStore();
    store.values.set('current', { version: 2, cachedAt: Date.now(), user: { id: 'user-1' } });
    store.values.set('stale', { version: 1, cachedAt: Date.now(), user: { id: 'user-2' } });

    await expect(getCachedAuthUserDoc(store, 'current')).resolves.toEqual({ id: 'user-1' });
    await expect(getCachedAuthUserDoc(store, 'stale')).resolves.toBeUndefined();
  });

  it('invalidates explicit and reverse-indexed cache keys', async () => {
    const store = makeStore();
    store.values.set(buildAuthUserDocReverseIndexKey('user-1'), ['key-a', 'key-b']);

    await invalidateCachedAuthUserDoc(store, { userId: 'user-1', cacheKey: 'key-c' });

    expect(store.delete).toHaveBeenCalledWith(buildAuthUserDocReverseIndexKey('user-1'));
    expect(store.delete).toHaveBeenCalledWith('key-a');
    expect(store.delete).toHaveBeenCalledWith('key-b');
    expect(store.delete).toHaveBeenCalledWith('key-c');
    // The epoch is the correctness fence and must land FIRST, before any cleanup.
    expect(store.set).toHaveBeenCalledWith(
      buildAuthUserDocEpochKey('user-1'),
      expect.any(Number),
      AUTH_USER_DOC_EPOCH_TTL_MS,
    );
    expect(store.set.mock.invocationCallOrder[0]).toBeLessThan(
      store.delete.mock.invocationCallOrder[0],
    );
  });

  it('rejects an UNINDEXED entry whose read predates the latest invalidation', async () => {
    const store = makeStore();
    const userId = new Types.ObjectId();
    const cacheKey = 'auth-user-doc:v1:unindexed';
    const readAt = Date.now() - 50;
    // The reverse index's read-modify-write can drop a concurrent fill's key, so
    // this entry exists but was never indexed — the invalidation's key sweep
    // cannot find it. Only the epoch fence can kill it.
    await setCachedAuthUserDoc(
      store,
      cacheKey,
      { _id: userId, id: userId.toString(), email: 'user@example.com' },
      { readAt },
    );
    store.values.delete(buildAuthUserDocReverseIndexKey(userId.toString()));

    await invalidateCachedAuthUserDoc(store, { userId: userId.toString() });
    expect(store.values.has(cacheKey)).toBe(true);

    await expect(getCachedAuthUserDoc(store, cacheKey)).resolves.toBeUndefined();
    // Rejected entries are also reaped, not just skipped.
    expect(store.values.has(cacheKey)).toBe(false);
  });

  it('serves an entry whose read happened after the latest invalidation', async () => {
    const store = makeStore();
    const userId = new Types.ObjectId();
    const cacheKey = 'auth-user-doc:v1:fresh';

    await invalidateCachedAuthUserDoc(store, { userId: userId.toString() });
    await setCachedAuthUserDoc(
      store,
      cacheKey,
      { _id: userId, id: userId.toString(), email: 'user@example.com' },
      { readAt: Date.now() + 5 },
    );

    await expect(getCachedAuthUserDoc(store, cacheKey)).resolves.toMatchObject({
      id: userId.toString(),
    });
  });

  it('logs cache failures without throwing', async () => {
    const store = {
      get: async <T = unknown>(): Promise<T | undefined> => {
        throw new Error('redis unavailable');
      },
      set: jest.fn(),
      delete: jest.fn(),
    };

    await expect(getCachedAuthUserDoc(store, 'key')).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      '[authUserDocCache] Cache read failed; falling back to user lookup',
      { error: 'redis unavailable' },
    );
  });
});
