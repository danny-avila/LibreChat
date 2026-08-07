const { CacheKeys } = require('librechat-data-provider');

const mockRedisClient = {
  set: jest.fn(),
  eval: jest.fn(),
};

jest.mock('@librechat/api', () => ({
  cacheConfig: { FORCED_IN_MEMORY_CACHE_NAMESPACES: [] },
  ioredisClient: mockRedisClient,
  keyvRedisClient: {},
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn() },
}));

jest.mock('~/cache/getLogStores', () => jest.fn());

const getLogStores = require('~/cache/getLogStores');
const mockCache = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };
getLogStores.mockReturnValue(mockCache);

const {
  setCachedTools,
  runWithGlobalCacheLock,
  invalidateCachedTools,
  setCachedToolsWithinGlobalLock,
} = require('../getCachedTools');

describe('global tool cache write lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.eval.mockResolvedValue(1);
    mockCache.set.mockResolvedValue(true);
    mockCache.delete.mockResolvedValue(true);
  });

  it('acquires and safely releases the Redis lock around an aggregate update', async () => {
    const operation = jest.fn().mockResolvedValue('updated');

    await expect(runWithGlobalCacheLock(operation)).resolves.toBe('updated');

    expect(mockRedisClient.set).toHaveBeenCalledWith(
      `${CacheKeys.TOOL_CACHE}:tools:global:write-lock`,
      expect.any(String),
      'PX',
      30_000,
      'NX',
    );
    const token = mockRedisClient.set.mock.calls[0][1];
    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('GET'"),
      1,
      `${CacheKeys.TOOL_CACHE}:tools:global:write-lock`,
      token,
    );
  });

  it('releases the Redis lock when the aggregate update fails', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('cache read failed'));

    await expect(runWithGlobalCacheLock(operation)).rejects.toThrow('cache read failed');

    expect(mockRedisClient.eval).toHaveBeenCalledTimes(1);
  });

  it('serializes direct global writes and invalidation', async () => {
    await setCachedTools({ builtin: {} });
    await invalidateCachedTools({ invalidateGlobal: true });

    expect(mockRedisClient.set).toHaveBeenCalledTimes(2);
    expect(mockRedisClient.eval).toHaveBeenCalledTimes(2);
  });

  it('does not reacquire the lock for a write already inside an aggregate update', async () => {
    await runWithGlobalCacheLock(() => setCachedToolsWithinGlobalLock({ mcp: {} }));

    expect(mockRedisClient.set).toHaveBeenCalledTimes(1);
    expect(mockRedisClient.eval).toHaveBeenCalledTimes(1);
    expect(mockCache.set).toHaveBeenCalledTimes(1);
  });
});
