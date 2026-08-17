const { tenantStorage, runAsSystem } = require('@librechat/data-schemas');

/**
 * Generation lifecycle callbacks run from timers and Redis handlers, where there
 * is no request-scoped tenant context. Re-establish the exact user's tenant for
 * tenant-isolated User writes; base users deliberately use the explicit system
 * context rather than inheriting an unrelated request context.
 */
const runForUserTenant = (userId, tenantId, operation) => {
  const run = async () => operation();
  return tenantId ? tenantStorage.run({ tenantId, userId }, run) : runAsSystem(run);
};

/**
 * Adapts User model methods to the process-level generation lifecycle store.
 * Keeping this adapter shared ensures the standard and clustered entrypoints
 * apply identical strict-tenant behavior.
 */
const createUserFinalizationFallbackStore = ({
  renewUserFinalizationFallbackLease,
  clearUserFinalizationFallbackLease,
  addUserAbortFence,
  clearUserAbortFence,
}) => ({
  renew: (userId, tenantId, safeLeaseKey, expiresAt) =>
    runForUserTenant(userId, tenantId, () =>
      renewUserFinalizationFallbackLease(userId, safeLeaseKey, expiresAt),
    ),
  clear: (userId, tenantId, safeLeaseKey) =>
    runForUserTenant(userId, tenantId, () =>
      clearUserFinalizationFallbackLease(userId, safeLeaseKey),
    ),
  retainAbortDelivery: (userId, tenantId, streamId, createdAt) =>
    runForUserTenant(userId, tenantId, () => addUserAbortFence(userId, streamId, createdAt)),
  clearAbortDelivery: (userId, tenantId, streamId, createdAt) =>
    runForUserTenant(userId, tenantId, () => clearUserAbortFence(userId, streamId, createdAt)),
});

module.exports = { createUserFinalizationFallbackStore };
