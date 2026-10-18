import {
  getUserId,
  getTenantId,
  runInTenant,
  runAsSystem,
  getRequestId,
  runInAccounts,
  runInPlatform,
  tenantStorage,
  scopedCacheKey,
  SYSTEM_TENANT_ID,
  isReservedTenantId,
  ACCOUNTS_TENANT_ID,
  PLATFORM_TENANT_ID,
} from './tenantContext';

describe('isReservedTenantId', () => {
  it('names the system, accounts and platform sentinels as reserved', () => {
    expect(isReservedTenantId(SYSTEM_TENANT_ID)).toBe(true);
    expect(isReservedTenantId(ACCOUNTS_TENANT_ID)).toBe(true);
    expect(isReservedTenantId(PLATFORM_TENANT_ID)).toBe(true);
  });

  it('runs a callback in the platform scope', async () => {
    await runInPlatform(async () => {
      expect(getTenantId()).toBe(PLATFORM_TENANT_ID);
    });
  });

  it('treats real and absent tenants as unreserved', () => {
    expect(isReservedTenantId('org_acme')).toBe(false);
    expect(isReservedTenantId(undefined)).toBe(false);
    expect(isReservedTenantId(null)).toBe(false);
    expect(isReservedTenantId('')).toBe(false);
  });
});

describe('runInTenant / runInAccounts', () => {
  it('scopes the callback to the given tenant and keeps request correlation', async () => {
    await tenantStorage.run(
      { tenantId: 'org_a', userId: 'user-1', requestId: 'req-1' },
      async () => {
        await runInTenant('org_b', async () => {
          expect(getTenantId()).toBe('org_b');
          expect(getUserId()).toBe('user-1');
          expect(getRequestId()).toBe('req-1');
        });
        expect(getTenantId()).toBe('org_a');
      },
    );
  });

  it('runs account work in the accounts tenant', async () => {
    await runInAccounts(async () => {
      expect(getTenantId()).toBe(ACCOUNTS_TENANT_ID);
      expect(scopedCacheKey('KEY')).toBe(`KEY:${ACCOUNTS_TENANT_ID}`);
    });
    expect(getTenantId()).toBeUndefined();
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
