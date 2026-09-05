const { tenantStorage } = require('@librechat/data-schemas');

const mockGetAppConfig = jest.fn().mockResolvedValue({ ok: true });
jest.mock('~/server/services/Config', () => ({
  getAppConfig: (...args) => mockGetAppConfig(...args),
}));

const configMiddleware = require('./app');

describe('configMiddleware — tenant resolution', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  function runInTenantContext(tenantId, fn) {
    return tenantStorage.run({ tenantId }, fn);
  }

  /**
   * Reproduces the exact mismatch the review flagged: a deployment that
   * resolves the authoritative tenant server-side (ALS, seeded from
   * `req.tenantId` by `tenantContextMiddleware`) must not have `req.config`
   * loaded — or cached — under a *different*, stale `req.user.tenantId` JWT
   * claim. Every other admin capability check and write already trusts ALS
   * via `getEffectiveTenantId`; `configMiddleware` must match.
   */
  it('loads config for the ALS-resolved tenant, not a mismatched user.tenantId claim', async () => {
    const req = { user: { tenantId: 'tenant-A-from-jwt', role: 'admin' }, path: '/api/config' };
    const next = jest.fn();

    await runInTenantContext('tenant-B-from-als', () => configMiddleware(req, {}, next));

    expect(mockGetAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-B-from-als' }),
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('falls back to the ALS-resolved tenant (not the user claim) on the error-recovery path too', async () => {
    mockGetAppConfig.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ ok: true });
    const req = { user: { tenantId: 'tenant-A-from-jwt', role: 'admin' }, path: '/api/config' };
    const next = jest.fn();

    await runInTenantContext('tenant-B-from-als', () => configMiddleware(req, {}, next));

    expect(mockGetAppConfig).toHaveBeenLastCalledWith({ tenantId: 'tenant-B-from-als' });
    expect(next).toHaveBeenCalledWith();
  });

  it('falls back to the user claim when no ALS tenant is active (no divergence to resolve)', async () => {
    const req = { user: { tenantId: 'tenant-A-from-jwt', role: 'admin' }, path: '/api/config' };
    const next = jest.fn();

    await configMiddleware(req, {}, next);

    expect(mockGetAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-A-from-jwt' }),
    );
  });
});
