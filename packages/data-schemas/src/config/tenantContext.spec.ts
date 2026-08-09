import type { Scope } from './tenantContext';
import {
  tenantStorage,
  getUserId,
  assertScope,
  createScope,
  getRequestId,
  runAsSystem,
  scopedCacheKey,
  normalizeTenantId,
  isReservedTenantId,
  RESERVED_TENANT_IDS,
  UnscopedAccessError,
  SYSTEM_TENANT_ID,
  BASE_TENANT_ID,
} from './tenantContext';

describe('reserved tenant sentinels', () => {
  it('defines the base tenant beside the system tenant', () => {
    expect(BASE_TENANT_ID).toBe('__BASE__');
    expect(SYSTEM_TENANT_ID).toBe('__SYSTEM__');
    expect([...RESERVED_TENANT_IDS].sort()).toEqual(['__BASE__', '__SYSTEM__']);
  });

  it('treats both sentinels as reserved inbound values', () => {
    expect(isReservedTenantId(BASE_TENANT_ID)).toBe(true);
    expect(isReservedTenantId(SYSTEM_TENANT_ID)).toBe(true);
  });

  it('leaves ordinary and absent tenant ids unreserved', () => {
    expect(isReservedTenantId('acme')).toBe(false);
    expect(isReservedTenantId('')).toBe(false);
    expect(isReservedTenantId(undefined)).toBe(false);
    expect(isReservedTenantId(null)).toBe(false);
  });

  it('normalizes absent, null and empty stored tenants onto the base sentinel', () => {
    expect(normalizeTenantId(undefined)).toBe(BASE_TENANT_ID);
    expect(normalizeTenantId(null)).toBe(BASE_TENANT_ID);
    expect(normalizeTenantId('')).toBe(BASE_TENANT_ID);
  });

  it('never rewrites a real tenant id', () => {
    expect(normalizeTenantId('acme')).toBe('acme');
  });
});

/**
 * Pins what the brand actually guarantees, which is narrower than "unforgeable":
 * a structurally identical object is refused, and every accepted value came out
 * of a constructor that normalized it and failed closed. Authorization is not
 * among the guarantees — that is what RLS is for.
 */
describe('scope brand', () => {
  it('refuses a structurally identical but unbranded object', () => {
    expect(() => assertScope({ tenantId: 'acme', userId: 'alice' } as Scope)).toThrow(
      UnscopedAccessError,
    );
  });

  it('refuses an absent scope rather than widening', () => {
    expect(() => assertScope(null)).toThrow(/no Scope supplied/);
    expect(() => assertScope(undefined)).toThrow(/no Scope supplied/);
  });

  it('passes through a value a constructor produced', () => {
    const scope = createScope({ tenantId: 'acme', userId: 'alice' });
    expect(assertScope(scope)).toBe(scope);
  });

  it('normalizes and trims before it fails closed', () => {
    expect(createScope({ tenantId: '  ', userId: ' alice ' })).toMatchObject({
      tenantId: BASE_TENANT_ID,
      userId: 'alice',
    });
  });

  it('freezes the value it hands back', () => {
    expect(Object.isFrozen(createScope({ tenantId: 'acme', userId: 'alice' }))).toBe(true);
  });
});

describe('scopedCacheKey', () => {
  it('returns base key when no ALS context is set', () => {
    expect(scopedCacheKey('MODELS_CONFIG')).toBe('MODELS_CONFIG');
  });

  it('returns base key in SYSTEM_TENANT_ID context', async () => {
    await runAsSystem(async () => {
      expect(scopedCacheKey('MODELS_CONFIG')).toBe('MODELS_CONFIG');
    });
  });

  it('appends tenantId when tenant context is active', async () => {
    await tenantStorage.run({ tenantId: 'acme' }, async () => {
      expect(scopedCacheKey('MODELS_CONFIG')).toBe('MODELS_CONFIG:acme');
    });
  });

  it('does not leak tenant context outside ALS scope', async () => {
    await tenantStorage.run({ tenantId: 'acme' }, async () => {
      expect(scopedCacheKey('KEY')).toBe('KEY:acme');
    });
    expect(scopedCacheKey('KEY')).toBe('KEY');
  });

  it('reads user and request IDs from ALS context', async () => {
    await tenantStorage.run({ userId: 'user-1', requestId: 'req-1' }, async () => {
      expect(getUserId()).toBe('user-1');
      expect(getRequestId()).toBe('req-1');
    });
  });

  it('preserves user and request context inside system tenant operations', async () => {
    await tenantStorage.run(
      { tenantId: 'acme', userId: 'user-1', requestId: 'req-1' },
      async () => {
        await runAsSystem(async () => {
          expect(getUserId()).toBe('user-1');
          expect(getRequestId()).toBe('req-1');
          expect(scopedCacheKey('KEY')).toBe('KEY');
        });
      },
    );
  });
});
