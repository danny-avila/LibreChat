import type { FederatedAuthCacheEntry, FederatedAuthCacheKeyInput } from './federatedAuthCache';
import {
  getFederatedAuthCacheKey,
  readFederatedAuthCache,
  writeFederatedAuthCache,
  invalidateFederatedAuthCache,
} from './federatedAuthCache';

jest.mock('~/cache', () => ({
  standardCache: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}));

type MockCache = {
  get: jest.Mock<Promise<unknown>, [string]>;
  set: jest.Mock<Promise<void>, [string, unknown, number]>;
  delete: jest.Mock<Promise<boolean>, [string]>;
};

function makeCache(value?: unknown): MockCache {
  return {
    get: jest.fn().mockResolvedValue(value),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(true),
  };
}

function makeInput(
  overrides: Partial<FederatedAuthCacheKeyInput> = {},
): FederatedAuthCacheKeyInput {
  return {
    tenantId: 'tenant-a',
    issuer: 'https://issuer.example.com/',
    subject: 'subject-123',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<FederatedAuthCacheEntry> = {}): FederatedAuthCacheEntry {
  return {
    userId: 'user-123',
    tenantId: 'tenant-a',
    subject: 'subject-123',
    issuer: 'https://issuer.example.com',
    email: 'user@example.com',
    username: 'testuser',
    name: 'Test User',
    role: 'USER',
    idOnTheSource: 'oid-123',
    accountSyncedAt: 1710000000000,
    ...overrides,
  };
}

describe('federatedAuthCache', () => {
  it('builds base and tenant scoped OpenID cache keys with normalized issuer', () => {
    const baseKey = getFederatedAuthCacheKey(makeInput({ tenantId: undefined }));
    const tenantKey = getFederatedAuthCacheKey(
      makeInput({ issuer: 'https://issuer.example.com/' }),
    );

    expect(baseKey).toBe('base:https://issuer.example.com:subject-123');
    expect(tenantKey).toBe('tenant-a:https://issuer.example.com:subject-123');
    expect(tenantKey).toBe(getFederatedAuthCacheKey(makeInput()));
  });

  it('keeps same-tenant subjects isolated by issuer', () => {
    expect(getFederatedAuthCacheKey(makeInput({ issuer: 'https://issuer.example.com' }))).not.toBe(
      getFederatedAuthCacheKey(makeInput({ issuer: 'https://other.example.com' })),
    );
  });

  it('reads a valid matching entry', async () => {
    const entry = makeEntry();
    const cache = makeCache(entry);

    await expect(readFederatedAuthCache(makeInput(), { enabled: true }, cache)).resolves.toEqual(
      entry,
    );
  });

  it('returns null when cache reads are disabled', async () => {
    const cache = makeCache(makeEntry());

    await expect(
      readFederatedAuthCache(makeInput(), { enabled: false }, cache),
    ).resolves.toBeNull();
    expect(cache.get).not.toHaveBeenCalled();
  });

  it.each([
    ['mismatched issuer', { issuer: 'https://other.example.com' }],
    ['mismatched subject', { subject: 'other-subject' }],
    ['mismatched tenant', { tenantId: 'tenant-b' }],
    ['missing user id', { userId: '' }],
    ['malformed timestamp', { accountSyncedAt: 'now' }],
  ])('ignores %s entries', async (_label, overrides) => {
    const cache = makeCache({ ...makeEntry(), ...overrides });

    await expect(readFederatedAuthCache(makeInput(), { enabled: true }, cache)).resolves.toBeNull();
  });

  it('writes with the configured per-entry ttl', async () => {
    const input = makeInput();
    const entry = makeEntry();
    const cache = makeCache();

    await writeFederatedAuthCache(input, entry, { enabled: true, ttlMs: 60000 }, cache);

    expect(cache.set).toHaveBeenCalledWith(getFederatedAuthCacheKey(input), entry, 60000);
  });

  it('does not write when cache writes are disabled or ttl is invalid', async () => {
    const cache = makeCache();

    await writeFederatedAuthCache(
      makeInput(),
      makeEntry(),
      { enabled: false, ttlMs: 60000 },
      cache,
    );
    await writeFederatedAuthCache(makeInput(), makeEntry(), { enabled: true, ttlMs: 0 }, cache);

    expect(cache.set).not.toHaveBeenCalled();
  });

  it('invalidates the exact key', async () => {
    const cache = makeCache();

    await invalidateFederatedAuthCache(makeInput(), cache);

    expect(cache.delete).toHaveBeenCalledWith(getFederatedAuthCacheKey(makeInput()));
  });
});
