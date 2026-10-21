// ── Mocks ──────────────────────────────────────────────────────────────

const mockClearAppConfigCache = jest.fn().mockResolvedValue(undefined);
const mockClearOverrideCache = jest.fn().mockResolvedValue(undefined);

jest.mock('~/cache/getLogStores', () => {
  return jest.fn(() => ({}));
});

jest.mock('~/server/services/start/tools', () => ({
  loadAndFormatTools: jest.fn(() => ({})),
}));

jest.mock('../loadCustomConfig', () => jest.fn().mockResolvedValue({}));

jest.mock('@librechat/data-schemas', () => {
  return {
    AppService: jest.fn(() => ({ availableTools: {} })),
    logger: { error: jest.fn() },
  };
});

jest.mock('~/models', () => ({
  initializeMessageBudget: jest.fn(),
  getApplicableConfigs: jest.fn().mockResolvedValue([]),
  getUserPrincipals: jest.fn().mockResolvedValue([]),
}));

const mockInvalidateCachedTools = jest.fn().mockResolvedValue(undefined);
jest.mock('../getCachedTools', () => ({
  setCachedTools: jest.fn().mockResolvedValue(undefined),
  invalidateCachedTools: mockInvalidateCachedTools,
}));

const mockClearMcpConfigCache = jest.fn().mockResolvedValue(undefined);
const mockCreateRedisPubSub = jest.fn(() => undefined);
/** The invalidation the module composes; its own behavior is covered in packages/api. */
const mockCreateConfigCacheInvalidation = jest.fn(({ clears }) => ({
  invalidate: async (tenantId) => {
    await Promise.allSettled(clears.map(({ clear }) => clear(tenantId)));
  },
  close: async () => undefined,
}));
jest.mock('@librechat/api', () => ({
  createAppConfigService: jest.fn(() => ({
    getAppConfig: jest.fn().mockResolvedValue({ availableTools: {} }),
    clearAppConfigCache: mockClearAppConfigCache,
    clearOverrideCache: mockClearOverrideCache,
  })),
  clearMcpConfigCache: mockClearMcpConfigCache,
  createConfigCacheInvalidation: mockCreateConfigCacheInvalidation,
  createRedisConfigInvalidationPubSub: mockCreateRedisPubSub,
  ioredisClient: null,
  cacheConfig: { USE_REDIS: false, REDIS_KEY_PREFIX: 'deploy-a' },
  createCodeEnvironmentRegistry: jest.fn(() => ({})),
  mergeAccessibleCodeEnvironments: jest.fn(({ appConfig }) => appConfig),
}));

// ── Tests ──────────────────────────────────────────────────────────────

const { getAppConfig, invalidateConfigCaches } = require('../app');
const { initializeMessageBudget } = require('~/models');
// Capture module-composition calls before clearMocks resets the spy history.
const budgetInitializations = [...initializeMessageBudget.mock.calls];
const invalidationOptions = mockCreateConfigCacheInvalidation.mock.calls[0][0];
const pubSubOptions = mockCreateRedisPubSub.mock.calls[0][0];

test('Config supplies its actual reader exactly once during composition', () => {
  expect(budgetInitializations).toEqual([[getAppConfig]]);
});

describe('invalidateConfigCaches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears the override and MCP config caches only', async () => {
    await invalidateConfigCaches();

    expect(invalidationOptions.clears.map(({ label }) => label)).toEqual([
      'clearOverrideCache',
      'clearMcpConfigCache',
    ]);
    expect(mockClearOverrideCache).toHaveBeenCalledTimes(1);
    expect(mockClearMcpConfigCache).toHaveBeenCalledTimes(1);
  });

  it('leaves the YAML base config and the tools derived from it alone', async () => {
    await invalidateConfigCaches('tenant-a');

    expect(mockClearAppConfigCache).not.toHaveBeenCalled();
    expect(mockInvalidateCachedTools).not.toHaveBeenCalled();
  });

  it('passes tenantId through to clearOverrideCache', async () => {
    await invalidateConfigCaches('tenant-a');

    expect(mockClearOverrideCache).toHaveBeenCalledWith('tenant-a');
  });

  it('asks for the Redis pub/sub with the deployment settings, and broadcasts nothing without it', () => {
    expect(pubSubOptions).toEqual({ useRedis: false, client: null, namespace: 'deploy-a' });
    expect(invalidationOptions.pubsub).toBeUndefined();
  });
});
