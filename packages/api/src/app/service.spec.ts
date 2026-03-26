import { createAppConfigService } from './service';

function createMockCache() {
  const store = new Map();
  return {
    get: jest.fn((key) => Promise.resolve(store.get(key))),
    set: jest.fn((key, value) => {
      store.set(key, value);
      return Promise.resolve(undefined);
    }),
    delete: jest.fn((key) => {
      store.delete(key);
      return Promise.resolve(true);
    }),
    /** Mimic Keyv's opts.store structure for key enumeration in clearOverrideCache */
    opts: { store: { keys: () => store.keys() } },
    _store: store,
  };
}

function createDeps(overrides = {}) {
  const cache = createMockCache();
  const baseConfig = { interface: { endpointsMenu: true }, endpoints: ['openAI'] };

  return {
    loadBaseConfig: jest.fn().mockResolvedValue(baseConfig),
    setCachedTools: jest.fn().mockResolvedValue(undefined),
    getCache: jest.fn().mockReturnValue(cache),
    cacheKeys: { APP_CONFIG: 'app_config' },
    getApplicableConfigs: jest.fn().mockResolvedValue([]),
    getUserPrincipals: jest.fn().mockResolvedValue([
      { principalType: 'role', principalId: 'USER' },
      { principalType: 'user', principalId: 'uid1' },
    ]),
    _cache: cache,
    _baseConfig: baseConfig,
    ...overrides,
  };
}

describe('createAppConfigService', () => {
  describe('getAppConfig', () => {
    it('loads base config on first call', async () => {
      const deps = createDeps();
      const { getAppConfig } = createAppConfigService(deps);

      const config = await getAppConfig();

      expect(deps.loadBaseConfig).toHaveBeenCalledTimes(1);
      expect(config).toEqual(deps._baseConfig);
    });

    it('caches base config — does not reload on second call', async () => {
      const deps = createDeps();
      const { getAppConfig } = createAppConfigService(deps);

      await getAppConfig();
      await getAppConfig();

      expect(deps.loadBaseConfig).toHaveBeenCalledTimes(1);
    });

    it('reloads base config when refresh is true', async () => {
      const deps = createDeps();
      const { getAppConfig } = createAppConfigService(deps);

      await getAppConfig();
      await getAppConfig({ refresh: true });

      expect(deps.loadBaseConfig).toHaveBeenCalledTimes(2);
    });

    it('queries DB for applicable configs', async () => {
      const deps = createDeps();
      const { getAppConfig } = createAppConfigService(deps);

      await getAppConfig({ role: 'ADMIN' });

      expect(deps.getApplicableConfigs).toHaveBeenCalled();
    });

    it('caches empty result — does not re-query DB on second call', async () => {
      const deps = createDeps({ getApplicableConfigs: jest.fn().mockResolvedValue([]) });
      const { getAppConfig } = createAppConfigService(deps);

      await getAppConfig({ role: 'USER' });
      await getAppConfig({ role: 'USER' });

      expect(deps.getApplicableConfigs).toHaveBeenCalledTimes(1);
    });

    it('merges DB configs when found', async () => {
      const deps = createDeps({
        getApplicableConfigs: jest
          .fn()
          .mockResolvedValue([
            { priority: 10, overrides: { interface: { endpointsMenu: false } }, isActive: true },
          ]),
      });
      const { getAppConfig } = createAppConfigService(deps);

      const config = await getAppConfig({ role: 'ADMIN' });

      expect(config.interface.endpointsMenu).toBe(false);
      expect(config.endpoints).toEqual(['openAI']);
    });

    it('caches merged result with TTL', async () => {
      const deps = createDeps({
        getApplicableConfigs: jest
          .fn()
          .mockResolvedValue([{ priority: 10, overrides: { x: 1 }, isActive: true }]),
      });
      const { getAppConfig } = createAppConfigService(deps);

      await getAppConfig({ role: 'ADMIN' });
      await getAppConfig({ role: 'ADMIN' });

      expect(deps.getApplicableConfigs).toHaveBeenCalledTimes(1);
    });

    it('uses separate cache keys per userId (no cross-user contamination)', async () => {
      const deps = createDeps({
        getApplicableConfigs: jest
          .fn()
          .mockResolvedValue([
            { priority: 100, overrides: { x: 'user-specific' }, isActive: true },
          ]),
      });
      const { getAppConfig } = createAppConfigService(deps);

      await getAppConfig({ userId: 'uid1' });
      await getAppConfig({ userId: 'uid2' });

      expect(deps.getApplicableConfigs).toHaveBeenCalledTimes(2);
    });

    it('userId without role gets its own cache key', async () => {
      const deps = createDeps({
        getApplicableConfigs: jest
          .fn()
          .mockResolvedValue([{ priority: 100, overrides: { y: 1 }, isActive: true }]),
      });
      const { getAppConfig } = createAppConfigService(deps);

      await getAppConfig({ userId: 'uid1' });

      const cachedKeys = [...deps._cache._store.keys()];
      const overrideKey = cachedKeys.find((k) => k.startsWith('_OVERRIDE_:'));
      expect(overrideKey).toBe('_OVERRIDE_:__default__:uid1');
    });

    it('tenantId is included in cache key to prevent cross-tenant contamination', async () => {
      const deps = createDeps({
        getApplicableConfigs: jest
          .fn()
          .mockResolvedValue([{ priority: 10, overrides: { x: 1 }, isActive: true }]),
      });
      const { getAppConfig } = createAppConfigService(deps);

      await getAppConfig({ role: 'ADMIN', tenantId: 'tenant-a' });
      await getAppConfig({ role: 'ADMIN', tenantId: 'tenant-b' });

      expect(deps.getApplicableConfigs).toHaveBeenCalledTimes(2);
    });

    it('base-only empty result does not block subsequent scoped queries with results', async () => {
      const mockGetConfigs = jest.fn().mockResolvedValue([]);
      const deps = createDeps({ getApplicableConfigs: mockGetConfigs });
      const { getAppConfig } = createAppConfigService(deps);

      await getAppConfig();

      mockGetConfigs.mockResolvedValueOnce([
        { priority: 10, overrides: { restricted: true }, isActive: true },
      ]);
      const config = await getAppConfig({ role: 'ADMIN' });

      expect(mockGetConfigs).toHaveBeenCalledTimes(2);
      expect((config as Record<string, unknown>).restricted).toBe(true);
    });

    it('does not short-circuit other users when one user has no overrides', async () => {
      const mockGetConfigs = jest.fn().mockResolvedValue([]);
      const deps = createDeps({ getApplicableConfigs: mockGetConfigs });
      const { getAppConfig } = createAppConfigService(deps);

      await getAppConfig({ role: 'USER' });
      expect(mockGetConfigs).toHaveBeenCalledTimes(1);

      mockGetConfigs.mockResolvedValueOnce([
        { priority: 10, overrides: { x: 'admin-only' }, isActive: true },
      ]);
      const config = await getAppConfig({ role: 'ADMIN' });

      expect(mockGetConfigs).toHaveBeenCalledTimes(2);
      expect((config as Record<string, unknown>).x).toBe('admin-only');
    });

    it('falls back to base config on getApplicableConfigs error', async () => {
      const deps = createDeps({
        getApplicableConfigs: jest.fn().mockRejectedValue(new Error('DB down')),
      });
      const { getAppConfig } = createAppConfigService(deps);

      const config = await getAppConfig({ role: 'ADMIN' });

      expect(config).toEqual(deps._baseConfig);
    });

    it('calls getUserPrincipals when userId is provided', async () => {
      const deps = createDeps();
      const { getAppConfig } = createAppConfigService(deps);

      await getAppConfig({ role: 'USER', userId: 'uid1' });

      expect(deps.getUserPrincipals).toHaveBeenCalledWith({
        userId: 'uid1',
        role: 'USER',
      });
    });

    it('does not call getUserPrincipals when only role is provided', async () => {
      const deps = createDeps();
      const { getAppConfig } = createAppConfigService(deps);

      await getAppConfig({ role: 'ADMIN' });

      expect(deps.getUserPrincipals).not.toHaveBeenCalled();
    });
  });

  describe('clearAppConfigCache', () => {
    it('clears base config so it reloads on next call', async () => {
      const deps = createDeps();
      const { getAppConfig, clearAppConfigCache } = createAppConfigService(deps);

      await getAppConfig();
      expect(deps.loadBaseConfig).toHaveBeenCalledTimes(1);

      await clearAppConfigCache();
      await getAppConfig();
      expect(deps.loadBaseConfig).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearOverrideCache', () => {
    it('clears all override caches when no tenantId is provided', async () => {
      const deps = createDeps({
        getApplicableConfigs: jest
          .fn()
          .mockResolvedValue([{ priority: 10, overrides: { x: 1 }, isActive: true }]),
      });
      const { getAppConfig, clearOverrideCache } = createAppConfigService(deps);

      await getAppConfig({ role: 'ADMIN', tenantId: 'tenant-a' });
      await getAppConfig({ role: 'ADMIN', tenantId: 'tenant-b' });
      expect(deps.getApplicableConfigs).toHaveBeenCalledTimes(2);

      await clearOverrideCache();

      // After clearing, both tenants should re-query DB
      await getAppConfig({ role: 'ADMIN', tenantId: 'tenant-a' });
      await getAppConfig({ role: 'ADMIN', tenantId: 'tenant-b' });
      expect(deps.getApplicableConfigs).toHaveBeenCalledTimes(4);
    });

    it('clears only specified tenant override caches', async () => {
      const deps = createDeps({
        getApplicableConfigs: jest
          .fn()
          .mockResolvedValue([{ priority: 10, overrides: { x: 1 }, isActive: true }]),
      });
      const { getAppConfig, clearOverrideCache } = createAppConfigService(deps);

      await getAppConfig({ role: 'ADMIN', tenantId: 'tenant-a' });
      await getAppConfig({ role: 'ADMIN', tenantId: 'tenant-b' });
      expect(deps.getApplicableConfigs).toHaveBeenCalledTimes(2);

      await clearOverrideCache('tenant-a');

      // tenant-a should re-query, tenant-b should be cached
      await getAppConfig({ role: 'ADMIN', tenantId: 'tenant-a' });
      await getAppConfig({ role: 'ADMIN', tenantId: 'tenant-b' });
      expect(deps.getApplicableConfigs).toHaveBeenCalledTimes(3);
    });

    it('does not clear base config', async () => {
      const deps = createDeps();
      const { getAppConfig, clearOverrideCache } = createAppConfigService(deps);

      await getAppConfig();
      expect(deps.loadBaseConfig).toHaveBeenCalledTimes(1);

      await clearOverrideCache();

      await getAppConfig();
      // Base config should still be cached
      expect(deps.loadBaseConfig).toHaveBeenCalledTimes(1);
    });
  });
});
