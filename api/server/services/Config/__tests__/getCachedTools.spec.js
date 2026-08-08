const { CacheKeys, Time } = require('librechat-data-provider');

jest.mock('~/cache/getLogStores');
const getLogStores = require('~/cache/getLogStores');

const mockCache = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };
getLogStores.mockReturnValue(mockCache);

const {
  ToolCacheKeys,
  getCachedTools,
  setCachedTools,
  setCachedToolsIfCurrent,
  getMCPToolsCacheGeneration,
  renewMCPToolsCacheGeneration,
  getCachedAppServerTools,
  setCachedAppServerTools,
  runWithGlobalCacheLock,
  invalidateCachedTools,
} = require('../getCachedTools');

describe('MCP tool cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getLogStores.mockReturnValue(mockCache);
  });

  it('uses collision-safe configuration-addressed keys', () => {
    expect(ToolCacheKeys.MCP_APP_SERVER('server:name', 'config/a')).toBe(
      'tools:mcp:app:server%3Aname:config%2Fa',
    );
    expect(ToolCacheKeys.MCP_SERVER('tenant:user', 'server:name', 'config/a')).toBe(
      'tools:mcp:user:{tenant%3Auser:server%3Aname}:config%2Fa',
    );
    expect(ToolCacheKeys.MCP_SERVER('tenant:user', 'server:name', 'config/a')).not.toBe(
      ToolCacheKeys.MCP_SERVER('tenant', 'user:server:name', 'config/a'),
    );
    expect(ToolCacheKeys.MCP_SERVER_GENERATION('tenant:user', 'server:name')).toBe(
      'tools:metadata:mcp:user-generation:{tenant%3Auser:server%3Aname}',
    );
    expect(ToolCacheKeys.MCP_SERVER_GENERATION('tenant:user', 'server:name')).not.toBe(
      ToolCacheKeys.MCP_SERVER_GENERATION('tenant', 'user:server:name'),
    );
  });

  it('keeps the legacy user key available for non-generation callers', () => {
    expect(ToolCacheKeys.MCP_SERVER('user123', 'github')).toBe('tools:mcp:user123:github');
  });

  it('gets and sets static global tools without touching MCP slices', async () => {
    const tools = { builtin: { type: 'function' } };
    mockCache.get.mockResolvedValue(tools);
    mockCache.set.mockResolvedValue(true);

    await expect(getCachedTools()).resolves.toBe(tools);
    await expect(setCachedTools(tools)).resolves.toBe(true);

    expect(mockCache.get).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL);
    expect(mockCache.set).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL, tools, expect.any(Number));
    expect(mockCache.delete).not.toHaveBeenCalled();
  });

  it('gets and sets an authoritative app slice, including an empty catalog', async () => {
    mockCache.get.mockResolvedValue({});
    mockCache.set.mockResolvedValue(true);

    await expect(getCachedAppServerTools('github', 'config-v2')).resolves.toEqual({});
    await expect(setCachedAppServerTools('github', 'config-v2', {})).resolves.toBe(true);

    const key = ToolCacheKeys.MCP_APP_SERVER('github', 'config-v2');
    expect(mockCache.get).toHaveBeenCalledWith(key);
    expect(mockCache.set).toHaveBeenCalledWith(key, {}, expect.any(Number));
  });

  it('stores unguarded user tools under the supplied config generation', async () => {
    const tools = { search: { type: 'function' } };
    mockCache.set.mockResolvedValue(true);

    await setCachedTools(tools, {
      userId: 'user1',
      serverName: 'github',
      configGeneration: 'config-v2',
    });

    expect(mockCache.set).toHaveBeenCalledWith(
      ToolCacheKeys.MCP_SERVER('user1', 'github', 'config-v2'),
      tools,
      expect.any(Number),
    );
  });

  it('writes guarded user tools under both config and connection generations', async () => {
    const tools = { current: { type: 'function' } };
    mockCache.get.mockResolvedValue('connection-a');
    mockCache.set.mockResolvedValue(true);

    await expect(
      setCachedToolsIfCurrent(tools, {
        userId: 'user1',
        serverName: 'github',
        configGeneration: 'config-v2',
        publicationGeneration: 'connection-a',
      }),
    ).resolves.toBe(true);

    expect(mockCache.set).toHaveBeenCalledWith(
      ToolCacheKeys.MCP_SERVER('user1', 'github', 'config-v2'),
      { version: 1, publicationGeneration: 'connection-a', tools },
      expect.any(Number),
    );
  });

  it('reads guarded user tools only while their connection generation is current', async () => {
    const tools = { current: { type: 'function' } };
    mockCache.get
      .mockResolvedValueOnce({
        version: 1,
        publicationGeneration: 'connection-a',
        tools,
      })
      .mockResolvedValueOnce('connection-a');

    await expect(
      getCachedTools({
        userId: 'user1',
        serverName: 'github',
        configGeneration: 'config-v2',
      }),
    ).resolves.toEqual(tools);

    expect(mockCache.get.mock.calls[0][0]).toBe(
      ToolCacheKeys.MCP_SERVER('user1', 'github', 'config-v2'),
    );
  });

  it('copies a legacy user catalog into the config-addressed key on rollout', async () => {
    const tools = { legacy: { type: 'function' } };
    mockCache.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(tools)
      .mockResolvedValueOnce('connection-a')
      .mockResolvedValueOnce('connection-a');
    mockCache.set.mockResolvedValue(true);

    await expect(
      getCachedTools({
        userId: 'user1',
        serverName: 'github',
        configGeneration: 'config-v2',
      }),
    ).resolves.toBe(tools);

    expect(mockCache.get).toHaveBeenNthCalledWith(3, ToolCacheKeys.MCP_SERVER('user1', 'github'));
    expect(mockCache.set).toHaveBeenCalledWith(
      ToolCacheKeys.MCP_SERVER('user1', 'github', 'config-v2'),
      {
        version: 1,
        publicationGeneration: 'connection-a',
        tools,
      },
      Time.TWELVE_HOURS,
    );
  });

  it('creates a generation fence before migrating a legacy user catalog', async () => {
    const tools = { legacy: { type: 'function' } };
    mockCache.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(tools)
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async () => mockCache.set.mock.calls[0][1]);
    mockCache.set.mockResolvedValue(true);

    await expect(
      getCachedTools({
        userId: 'user1',
        serverName: 'github',
        configGeneration: 'config-v2',
      }),
    ).resolves.toBe(tools);

    const [generationKey, generation] = mockCache.set.mock.calls[0];
    expect(generationKey).toBe(ToolCacheKeys.MCP_SERVER_GENERATION('user1', 'github'));
    expect(generation).toEqual(expect.any(String));
    expect(mockCache.set.mock.calls[1][1]).toEqual(
      expect.objectContaining({ publicationGeneration: generation, tools }),
    );
  });

  it('preserves a config-addressed catalog published during legacy fallback', async () => {
    const current = { current: { type: 'function' } };
    mockCache.get.mockResolvedValueOnce(null).mockResolvedValueOnce(current);

    await expect(
      getCachedTools({
        userId: 'user1',
        serverName: 'github',
        configGeneration: 'config-v2',
      }),
    ).resolves.toBe(current);

    expect(mockCache.get).toHaveBeenCalledTimes(2);
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('hides a guarded entry after its connection generation is replaced', async () => {
    mockCache.get
      .mockResolvedValueOnce({
        version: 1,
        publicationGeneration: 'connection-a',
        tools: { stale: {} },
      })
      .mockResolvedValueOnce('connection-b');

    await expect(
      getCachedTools({
        userId: 'user1',
        serverName: 'github',
        configGeneration: 'config-v1',
      }),
    ).resolves.toBeNull();
  });

  it('cannot let a late old-config write replace the current config key', async () => {
    mockCache.get.mockResolvedValue('connection-a');
    mockCache.set.mockResolvedValue(true);

    await setCachedToolsIfCurrent(
      { current: {} },
      {
        userId: 'user1',
        serverName: 'github',
        configGeneration: 'config-v2',
        publicationGeneration: 'connection-a',
      },
    );
    await setCachedToolsIfCurrent(
      { stale: {} },
      {
        userId: 'user1',
        serverName: 'github',
        configGeneration: 'config-v1',
        publicationGeneration: 'connection-a',
      },
    );

    expect(mockCache.set).toHaveBeenCalledWith(
      ToolCacheKeys.MCP_SERVER('user1', 'github', 'config-v2'),
      expect.objectContaining({ tools: { current: {} } }),
      expect.any(Number),
    );
    expect(mockCache.set).toHaveBeenCalledWith(
      ToolCacheKeys.MCP_SERVER('user1', 'github', 'config-v1'),
      expect.objectContaining({ tools: { stale: {} } }),
      expect.any(Number),
    );
  });

  it('creates and reuses a durable connection publication generation', async () => {
    mockCache.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('existing-generation');
    mockCache.set.mockResolvedValue(true);

    const created = await getMCPToolsCacheGeneration({ userId: 'user1', serverName: 'github' });
    const existing = await getMCPToolsCacheGeneration({ userId: 'user1', serverName: 'github' });

    expect(created).toEqual(expect.any(String));
    expect(existing).toBe('existing-generation');
    expect(mockCache.set).toHaveBeenCalledWith(
      ToolCacheKeys.MCP_SERVER_GENERATION('user1', 'github'),
      created,
      expect.any(Number),
    );
  });

  it('renews a lease only for its current publication generation', async () => {
    mockCache.get.mockResolvedValue('connection-a');
    mockCache.set.mockResolvedValue(true);

    await expect(
      renewMCPToolsCacheGeneration({
        userId: 'user1',
        serverName: 'github',
        publicationGeneration: 'connection-a',
      }),
    ).resolves.toBe(true);
    await expect(
      renewMCPToolsCacheGeneration({
        userId: 'user1',
        serverName: 'github',
        publicationGeneration: 'connection-b',
      }),
    ).resolves.toBe(false);
  });

  it('rotates the connection generation before deleting the legacy user key', async () => {
    mockCache.set.mockResolvedValue(true);
    mockCache.delete.mockResolvedValue(true);

    await invalidateCachedTools({ userId: 'user1', serverName: 'github' });

    expect(mockCache.set).toHaveBeenCalledWith(
      ToolCacheKeys.MCP_SERVER_GENERATION('user1', 'github'),
      expect.any(String),
      expect.any(Number),
    );
    expect(mockCache.set.mock.calls[0][2]).toBeGreaterThanOrEqual(Time.ONE_DAY);
    expect(mockCache.delete).toHaveBeenCalledWith(ToolCacheKeys.MCP_SERVER('user1', 'github'));
    expect(mockCache.set.mock.invocationCallOrder[0]).toBeLessThan(
      mockCache.delete.mock.invocationCallOrder[0],
    );
  });

  it('invalidates only the static global key for broad config changes', async () => {
    mockCache.delete.mockResolvedValue(true);

    await invalidateCachedTools({ invalidateGlobal: true });

    expect(mockCache.delete).toHaveBeenCalledTimes(1);
    expect(mockCache.delete).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL);
  });

  it('runs global cache operations directly when the cache is in memory', async () => {
    const operation = jest.fn().mockResolvedValue('done');
    await expect(runWithGlobalCacheLock(operation)).resolves.toBe('done');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('uses only the TOOL_CACHE namespace', async () => {
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue(true);
    mockCache.delete.mockResolvedValue(true);

    await getCachedTools();
    await getCachedAppServerTools('github', 'config-v2');
    await setCachedTools({});
    await invalidateCachedTools({ invalidateGlobal: true });

    expect(getLogStores.mock.calls.flat().every((key) => key === CacheKeys.TOOL_CACHE)).toBe(true);
  });
});
