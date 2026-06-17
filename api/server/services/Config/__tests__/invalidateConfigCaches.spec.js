// ── Mocks ──────────────────────────────────────────────────────────────

const mockClearAppConfigCache = jest.fn().mockResolvedValue(undefined);
const mockClearOverrideCache = jest.fn().mockResolvedValue(undefined);
const mockGetAppConfig = jest.fn().mockResolvedValue({ availableTools: {} });

jest.mock('~/cache/getLogStores', () => {
  return jest.fn(() => ({}));
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
    getAppConfig: mockGetAppConfig,
    clearAppConfigCache: mockClearAppConfigCache,
    clearOverrideCache: mockClearOverrideCache,
  })),
  clearMcpConfigCache: mockClearMcpConfigCache,
}));

// ── Tests ──────────────────────────────────────────────────────────────

const { invalidateConfigCaches } = require('../app');

describe('invalidateConfigCaches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAppConfig.mockResolvedValue({ availableTools: {} });
  });

  it('clears all caches', async () => {
    await invalidateConfigCaches();

    expect(mockClearAppConfigCache).toHaveBeenCalledTimes(1);
    expect(mockClearOverrideCache).toHaveBeenCalledTimes(1);
    expect(mockInvalidateCachedTools).toHaveBeenCalledWith({ invalidateGlobal: true });
    expect(mockClearMcpConfigCache).toHaveBeenCalledTimes(1);
  });

  it('passes tenantId through to clearOverrideCache', async () => {
    await invalidateConfigCaches('tenant-a');

    expect(mockClearOverrideCache).toHaveBeenCalledWith('tenant-a');
    expect(mockClearAppConfigCache).toHaveBeenCalledTimes(1);
    expect(mockInvalidateCachedTools).toHaveBeenCalledWith({ invalidateGlobal: true });
  });

  it('refreshes the MCP registry with the merged mcpSettings allowlists (global mutation)', async () => {
    mockGetAppConfig.mockResolvedValue({
      availableTools: {},
      mcpSettings: {
        allowedDomains: ['admin-added.com'],
        allowedAddresses: ['10.0.0.0/8'],
      },
    });

    await invalidateConfigCaches();

    // strictOverrides so a DB error throws rather than silently overwriting with YAML.
    expect(mockGetAppConfig).toHaveBeenCalledWith({ refresh: true, strictOverrides: true });
    expect(mockClearMcpConfigCache).toHaveBeenCalledWith({
      allowedDomains: ['admin-added.com'],
      allowedAddresses: ['10.0.0.0/8'],
    });
  });

  it('skips the allowlist refresh for tenant-scoped mutations (no cross-tenant leak)', async () => {
    await invalidateConfigCaches('tenant-a');

    // The process-global registry singleton must not be set from one tenant's view.
    expect(mockGetAppConfig).not.toHaveBeenCalled();
    expect(mockClearMcpConfigCache).toHaveBeenCalledWith(undefined);
  });

  it('preserves current allowlists (no allowlist arg) when the merged read fails', async () => {
    mockGetAppConfig.mockRejectedValue(new Error('DB unavailable'));

    await expect(invalidateConfigCaches()).resolves.not.toThrow();

    expect(mockClearMcpConfigCache).toHaveBeenCalledTimes(1);
    expect(mockClearMcpConfigCache).toHaveBeenCalledWith(undefined);
  });

  it('clears the MCP config cache after the app/override caches are cleared', async () => {
    const order = [];

    mockClearAppConfigCache.mockImplementation(async () => {
      order.push('base');
    });
    mockClearOverrideCache.mockImplementation(async () => {
      order.push('override');
    });
    mockInvalidateCachedTools.mockImplementation(async () => {
      order.push('tools');
    });
    mockClearMcpConfigCache.mockImplementation(async () => {
      order.push('mcp');
    });

    await invalidateConfigCaches();

    // The three base clears happen before the MCP cache eviction so the merged
    // allowlist read reflects the freshly-invalidated config.
    expect(order).toHaveLength(4);
    expect(order.slice(0, 3).sort()).toEqual(['base', 'override', 'tools']);
    expect(order[3]).toBe('mcp');
  });

  it('resolves even when clearAppConfigCache throws (partial failure)', async () => {
    mockClearAppConfigCache.mockRejectedValueOnce(new Error('cache connection lost'));

    await expect(invalidateConfigCaches()).resolves.not.toThrow();

    expect(mockClearOverrideCache).toHaveBeenCalledTimes(1);
    expect(mockInvalidateCachedTools).toHaveBeenCalledWith({ invalidateGlobal: true });
  });
});
