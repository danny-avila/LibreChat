const { CacheKeys } = require('librechat-data-provider');

const mockRedisClient = {
  set: jest.fn(),
  eval: jest.fn(),
};
const mockKeyvRedisClient = {
  eval: jest.fn(),
};

jest.mock('@librechat/api', () => ({
  cacheConfig: { FORCED_IN_MEMORY_CACHE_NAMESPACES: [] },
  mcpConfig: { USER_CONNECTION_IDLE_TIMEOUT: 15 * 60 * 1000 },
  ioredisClient: mockRedisClient,
  keyvRedisClient: mockKeyvRedisClient,
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
  setCachedToolsIfCurrent,
  runWithGlobalCacheLock,
  invalidateCachedTools,
  setCachedToolsWithinGlobalLock,
} = require('../getCachedTools');

describe('global tool cache write lock', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.eval.mockResolvedValue(1);
    mockKeyvRedisClient.eval.mockResolvedValue(1);
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

  it('uses an atomic generation check for generation-guarded user publications', async () => {
    await expect(
      setCachedToolsIfCurrent(
        { current: {} },
        {
          userId: 'user-1',
          serverName: 'server-1',
          configGeneration: 'config-current',
          publicationGeneration: 'generation-current',
        },
      ),
    ).resolves.toBe(true);

    expect(mockRedisClient.set).toHaveBeenCalledWith(
      `${CacheKeys.TOOL_CACHE}:tools:mcp-write-lock:user-1:server-1`,
      expect.any(String),
      'PX',
      30_000,
      'NX',
    );
    expect(mockRedisClient.eval).toHaveBeenCalledTimes(1);
    expect(mockKeyvRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("value['value'] ~= ARGV[1]"),
      expect.objectContaining({
        keys: [`${CacheKeys.TOOL_CACHE}:tools:metadata:mcp:user-generation:user-1:server-1`],
        arguments: ['generation-current', expect.any(String), expect.any(String)],
      }),
    );
    expect(mockCache.set).toHaveBeenCalledWith(
      'tools:mcp:user:user-1:server-1:config-current',
      {
        version: 1,
        publicationGeneration: 'generation-current',
        tools: { current: {} },
      },
      expect.any(Number),
    );
  });

  it('does not write tools when the atomic generation check observes a replacement', async () => {
    mockKeyvRedisClient.eval.mockResolvedValue(0);

    await expect(
      setCachedToolsIfCurrent(
        { stale: {} },
        {
          userId: 'user-1',
          serverName: 'server-1',
          configGeneration: 'config-old',
          publicationGeneration: 'generation-old',
        },
      ),
    ).resolves.toBe(false);

    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('waits through the full abandoned Redis lease before giving up', async () => {
    jest.useFakeTimers();
    const startedAt = Date.now();
    mockRedisClient.set.mockImplementation(async () =>
      Date.now() - startedAt >= 30_000 ? 'OK' : null,
    );
    const operation = jest.fn().mockResolvedValue('recovered');

    const result = runWithGlobalCacheLock(operation);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(operation).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(25_100);
    await expect(result).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
