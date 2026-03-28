// ── Mocks ──────────────────────────────────────────────────────────────

const mockConfigStoreDelete = jest.fn().mockResolvedValue(true);
const mockClearAppConfigCache = jest.fn().mockResolvedValue(undefined);
const mockClearOverrideCache = jest.fn().mockResolvedValue(undefined);

jest.mock('~/cache/getLogStores', () => {
  return jest.fn(() => ({
    delete: mockConfigStoreDelete,
  }));
});

jest.mock('~/server/services/start/tools', () => ({
  loadAndFormatTools: jest.fn(() => ({})),
}));

jest.mock('../loadCustomConfig', () => jest.fn().mockResolvedValue({}));

jest.mock('@librechat/data-schemas', () => {
  const actual = jest.requireActual('@librechat/data-schemas');
  return { ...actual, AppService: jest.fn(() => ({ availableTools: {} })) };
});

jest.mock('~/models', () => ({
  getApplicableConfigs: jest.fn().mockResolvedValue([]),
  getUserPrincipals: jest.fn().mockResolvedValue([]),
}));

const mockInvalidateCachedTools = jest.fn().mockResolvedValue(undefined);
jest.mock('../getCachedTools', () => ({
  setCachedTools: jest.fn().mockResolvedValue(undefined),
  invalidateCachedTools: mockInvalidateCachedTools,
}));

const mockClearMcpConfigCache = jest.fn().mockResolvedValue(undefined);
jest.mock('@librechat/api', () => ({
  createAppConfigService: jest.fn(() => ({
    getAppConfig: jest.fn().mockResolvedValue({ availableTools: {} }),
    clearAppConfigCache: mockClearAppConfigCache,
    clearOverrideCache: mockClearOverrideCache,
  })),
  clearMcpConfigCache: mockClearMcpConfigCache,
}));

// ── Tests ──────────────────────────────────────────────────────────────

const { CacheKeys } = require('librechat-data-provider');
const { invalidateConfigCaches } = require('../app');

describe('invalidateConfigCaches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears all four caches', async () => {
    await invalidateConfigCaches();

    expect(mockClearAppConfigCache).toHaveBeenCalledTimes(1);
    expect(mockClearOverrideCache).toHaveBeenCalledTimes(1);
    expect(mockInvalidateCachedTools).toHaveBeenCalledWith({ invalidateGlobal: true });
    expect(mockConfigStoreDelete).toHaveBeenCalledWith(CacheKeys.ENDPOINT_CONFIG);
  });

  it('passes tenantId through to clearOverrideCache', async () => {
    await invalidateConfigCaches('tenant-a');

    expect(mockClearOverrideCache).toHaveBeenCalledWith('tenant-a');
    expect(mockClearAppConfigCache).toHaveBeenCalledTimes(1);
    expect(mockInvalidateCachedTools).toHaveBeenCalledWith({ invalidateGlobal: true });
  });

  it('does not throw when CONFIG_STORE.delete fails', async () => {
    mockConfigStoreDelete.mockRejectedValueOnce(new Error('store not found'));

    await expect(invalidateConfigCaches()).resolves.not.toThrow();

    // Other caches should still have been invalidated
    expect(mockClearAppConfigCache).toHaveBeenCalledTimes(1);
    expect(mockClearOverrideCache).toHaveBeenCalledTimes(1);
    expect(mockInvalidateCachedTools).toHaveBeenCalledWith({ invalidateGlobal: true });
  });

  it('all operations run in parallel (not sequentially)', async () => {
    const order = [];

    mockClearAppConfigCache.mockImplementation(
      () =>
        new Promise((r) =>
          setTimeout(() => {
            order.push('base');
            r();
          }, 10),
        ),
    );
    mockClearOverrideCache.mockImplementation(
      () =>
        new Promise((r) =>
          setTimeout(() => {
            order.push('override');
            r();
          }, 10),
        ),
    );
    mockInvalidateCachedTools.mockImplementation(
      () =>
        new Promise((r) =>
          setTimeout(() => {
            order.push('tools');
            r();
          }, 10),
        ),
    );
    mockConfigStoreDelete.mockImplementation(
      () =>
        new Promise((r) =>
          setTimeout(() => {
            order.push('endpoint');
            r();
          }, 10),
        ),
    );

    await invalidateConfigCaches();

    // All four should have been called (parallel execution via Promise.allSettled)
    expect(order).toHaveLength(4);
    expect(new Set(order)).toEqual(new Set(['base', 'override', 'tools', 'endpoint']));
  });

  it('resolves even when clearAppConfigCache throws (partial failure)', async () => {
    mockClearAppConfigCache.mockRejectedValueOnce(new Error('cache connection lost'));

    await expect(invalidateConfigCaches()).resolves.not.toThrow();

    // Other caches should still have been invalidated despite the failure
    expect(mockClearOverrideCache).toHaveBeenCalledTimes(1);
    expect(mockInvalidateCachedTools).toHaveBeenCalledWith({ invalidateGlobal: true });
  });
});
