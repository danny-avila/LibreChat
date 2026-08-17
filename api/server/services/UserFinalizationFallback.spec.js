const {
  getTenantId,
  getUserId,
  tenantStorage,
  SYSTEM_TENANT_ID,
} = require('@librechat/data-schemas');
const { createUserFinalizationFallbackStore } = require('./UserFinalizationFallback');

describe('UserFinalizationFallback startup adapter', () => {
  const makeStrictUserMethod = (contexts) =>
    jest.fn(async () => {
      const tenantId = getTenantId();
      if (!tenantId) {
        throw new Error('[TenantIsolation] Query attempted without tenant context in strict mode');
      }
      contexts.push({ tenantId, userId: getUserId() });
    });

  test('establishes tenant context for every timer callback with no request context', async () => {
    const contexts = [];
    const renewUserFinalizationFallbackLease = makeStrictUserMethod(contexts);
    const clearUserFinalizationFallbackLease = makeStrictUserMethod(contexts);
    const addUserAbortFence = makeStrictUserMethod(contexts);
    const clearUserAbortFence = makeStrictUserMethod(contexts);
    const store = createUserFinalizationFallbackStore({
      renewUserFinalizationFallbackLease,
      clearUserFinalizationFallbackLease,
      addUserAbortFence,
      clearUserAbortFence,
    });

    expect(tenantStorage.getStore()).toBeUndefined();

    await store.renew('user-1', 'tenant-a', 'fallback_1', new Date());
    await store.clear('user-1', 'tenant-a', 'fallback_1');
    await store.retainAbortDelivery('user-1', 'tenant-a', 'stream-1', 101);
    await store.clearAbortDelivery('user-1', 'tenant-a', 'stream-1', 101);

    expect(contexts).toEqual([
      { tenantId: 'tenant-a', userId: 'user-1' },
      { tenantId: 'tenant-a', userId: 'user-1' },
      { tenantId: 'tenant-a', userId: 'user-1' },
      { tenantId: 'tenant-a', userId: 'user-1' },
    ]);
    expect(renewUserFinalizationFallbackLease).toHaveBeenCalledWith(
      'user-1',
      'fallback_1',
      expect.any(Date),
    );
    expect(clearUserFinalizationFallbackLease).toHaveBeenCalledWith('user-1', 'fallback_1');
    expect(addUserAbortFence).toHaveBeenCalledWith('user-1', 'stream-1', 101);
    expect(clearUserAbortFence).toHaveBeenCalledWith('user-1', 'stream-1', 101);
  });

  test('uses explicit system context for tenantless users instead of ambient request context', async () => {
    const contexts = [];
    const renewUserFinalizationFallbackLease = makeStrictUserMethod(contexts);
    const store = createUserFinalizationFallbackStore({
      renewUserFinalizationFallbackLease,
      clearUserFinalizationFallbackLease: jest.fn(),
      addUserAbortFence: jest.fn(),
      clearUserAbortFence: jest.fn(),
    });

    await tenantStorage.run({ tenantId: 'unrelated-tenant', userId: 'other-user' }, async () =>
      store.renew('base-user', undefined, 'fallback_base', new Date()),
    );

    expect(contexts).toEqual([{ tenantId: SYSTEM_TENANT_ID, userId: 'other-user' }]);
  });
});
