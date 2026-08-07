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
  getCachedAppServerSnapshots,
  setCachedAppServerSnapshots,
  runWithGlobalCacheLock,
  invalidateCachedTools,
} = require('../getCachedTools');

describe('getCachedTools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getLogStores.mockReturnValue(mockCache);
  });

  describe('ToolCacheKeys.MCP_SERVER', () => {
    it('should generate cache keys that include userId', () => {
      const key = ToolCacheKeys.MCP_SERVER('user123', 'github');
      expect(key).toBe('tools:mcp:user123:github');
    });

    it('uses a separate durable key for the publication generation', () => {
      expect(ToolCacheKeys.MCP_SERVER_GENERATION('user123', 'github')).toBe(
        'tools:mcp:user123:github:publication-generation',
      );
    });
  });

  describe('ToolCacheKeys.MCP_APP_SERVER_SNAPSHOTS', () => {
    it('uses a dedicated key for authoritative app snapshots', () => {
      expect(ToolCacheKeys.MCP_APP_SERVER_SNAPSHOTS).toBe('tools:mcp:app:snapshots');
    });
  });

  describe('TOOL_CACHE namespace usage', () => {
    it('getCachedTools should use TOOL_CACHE namespace', async () => {
      mockCache.get.mockResolvedValue(null);
      await getCachedTools();
      expect(getLogStores).toHaveBeenCalledWith(CacheKeys.TOOL_CACHE);
    });

    it('getCachedTools with MCP server options should use TOOL_CACHE namespace', async () => {
      mockCache.get.mockResolvedValue({ tool1: {} });
      await getCachedTools({ userId: 'user1', serverName: 'github' });
      expect(getLogStores).toHaveBeenCalledWith(CacheKeys.TOOL_CACHE);
      expect(mockCache.get).toHaveBeenCalledWith(ToolCacheKeys.MCP_SERVER('user1', 'github'));
    });

    it('setCachedTools should use TOOL_CACHE namespace', async () => {
      mockCache.set.mockResolvedValue(true);
      const tools = { tool1: { type: 'function' } };
      await setCachedTools(tools);
      expect(getLogStores).toHaveBeenCalledWith(CacheKeys.TOOL_CACHE);
      expect(mockCache.delete).toHaveBeenCalledWith(ToolCacheKeys.MCP_APP_SERVER_SNAPSHOTS);
      expect(mockCache.set).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL, tools, expect.any(Number));
    });

    it('gets and sets authoritative app snapshot names', async () => {
      mockCache.get.mockResolvedValue(['empty']);
      mockCache.set.mockResolvedValue(true);

      await expect(getCachedAppServerSnapshots()).resolves.toEqual(['empty']);
      await expect(setCachedAppServerSnapshots(['empty', 'dynamic'])).resolves.toBe(true);

      expect(mockCache.get).toHaveBeenCalledWith(ToolCacheKeys.MCP_APP_SERVER_SNAPSHOTS);
      expect(mockCache.set).toHaveBeenCalledWith(
        ToolCacheKeys.MCP_APP_SERVER_SNAPSHOTS,
        ['empty', 'dynamic'],
        expect.any(Number),
      );
    });

    it('setCachedTools with MCP server options should use TOOL_CACHE namespace', async () => {
      mockCache.set.mockResolvedValue(true);
      const tools = { tool1: { type: 'function' } };
      await setCachedTools(tools, { userId: 'user1', serverName: 'github' });
      expect(getLogStores).toHaveBeenCalledWith(CacheKeys.TOOL_CACHE);
      expect(mockCache.set).toHaveBeenCalledWith(
        ToolCacheKeys.MCP_SERVER('user1', 'github'),
        tools,
        expect.any(Number),
      );
    });

    it('creates and reuses a durable user publication generation', async () => {
      mockCache.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('existing-generation');
      mockCache.set.mockResolvedValue(true);

      const created = await getMCPToolsCacheGeneration({ userId: 'user1', serverName: 'github' });
      const existing = await getMCPToolsCacheGeneration({ userId: 'user1', serverName: 'github' });

      expect(created).toEqual(expect.any(String));
      expect(mockCache.set).toHaveBeenCalledWith(
        ToolCacheKeys.MCP_SERVER_GENERATION('user1', 'github'),
        created,
        expect.any(Number),
      );
      expect(existing).toBe('existing-generation');
    });

    it('writes user tools only for the current publication generation', async () => {
      const tools = { current: { type: 'function' } };
      mockCache.get.mockResolvedValue('generation-a');
      mockCache.set.mockResolvedValue(true);

      await expect(
        setCachedToolsIfCurrent(tools, {
          userId: 'user1',
          serverName: 'github',
          publicationGeneration: 'generation-a',
        }),
      ).resolves.toBe(true);

      expect(mockCache.set).toHaveBeenCalledWith(
        ToolCacheKeys.MCP_SERVER('user1', 'github'),
        tools,
        expect.any(Number),
      );
      expect(mockCache.set).toHaveBeenCalledWith(
        ToolCacheKeys.MCP_SERVER_GENERATION('user1', 'github'),
        'generation-a',
        expect.any(Number),
      );
    });

    it('renews an active connection lease only for its current publication generation', async () => {
      mockCache.get.mockResolvedValue('generation-a');
      mockCache.set.mockResolvedValue(true);

      await expect(
        renewMCPToolsCacheGeneration({
          userId: 'user1',
          serverName: 'github',
          publicationGeneration: 'generation-a',
        }),
      ).resolves.toBe(true);

      expect(mockCache.set).toHaveBeenCalledWith(
        ToolCacheKeys.MCP_SERVER_GENERATION('user1', 'github'),
        'generation-a',
        expect.any(Number),
      );
    });

    it('does not revive an expired or replaced publication generation', async () => {
      mockCache.get.mockResolvedValue(null);

      await expect(
        renewMCPToolsCacheGeneration({
          userId: 'user1',
          serverName: 'github',
          publicationGeneration: 'generation-a',
        }),
      ).resolves.toBe(false);

      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('rejects stale user tools without writing them', async () => {
      mockCache.get.mockResolvedValue('generation-b');

      await expect(
        setCachedToolsIfCurrent(
          { stale: { type: 'function' } },
          {
            userId: 'user1',
            serverName: 'github',
            publicationGeneration: 'generation-a',
          },
        ),
      ).resolves.toBe(false);

      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('rotates the publication generation before deleting user tools', async () => {
      mockCache.set.mockResolvedValue(true);
      mockCache.delete.mockResolvedValue(true);

      await invalidateCachedTools({ userId: 'user1', serverName: 'github' });

      const generationWrite = mockCache.set.mock.invocationCallOrder[0];
      const toolDelete = mockCache.delete.mock.invocationCallOrder[0];
      expect(mockCache.set).toHaveBeenCalledWith(
        ToolCacheKeys.MCP_SERVER_GENERATION('user1', 'github'),
        expect.any(String),
        expect.any(Number),
      );
      expect(mockCache.set.mock.calls[0][2]).toBeGreaterThanOrEqual(Time.ONE_DAY);
      expect(mockCache.delete).toHaveBeenCalledWith(ToolCacheKeys.MCP_SERVER('user1', 'github'));
      expect(generationWrite).toBeLessThan(toolDelete);
    });

    it('fences a stale publication queued behind credential invalidation', async () => {
      mockCache.get.mockResolvedValue('new-generation');
      mockCache.set.mockResolvedValue(true);
      mockCache.delete.mockResolvedValue(true);

      const invalidation = invalidateCachedTools({ userId: 'user1', serverName: 'github' });
      const stalePublication = setCachedToolsIfCurrent(
        { stale: { type: 'function' } },
        {
          userId: 'user1',
          serverName: 'github',
          publicationGeneration: 'old-generation',
        },
      );

      await expect(Promise.all([invalidation, stalePublication])).resolves.toEqual([
        undefined,
        false,
      ]);
      expect(mockCache.set).not.toHaveBeenCalledWith(
        ToolCacheKeys.MCP_SERVER('user1', 'github'),
        expect.anything(),
        expect.anything(),
      );
    });

    it('runs global cache operations directly when the tool cache is not Redis-backed', async () => {
      const operation = jest.fn().mockResolvedValue('done');

      await expect(runWithGlobalCacheLock(operation)).resolves.toBe('done');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('invalidateCachedTools should use TOOL_CACHE namespace', async () => {
      mockCache.delete.mockResolvedValue(true);
      await invalidateCachedTools({ invalidateGlobal: true });
      expect(getLogStores).toHaveBeenCalledWith(CacheKeys.TOOL_CACHE);
      expect(mockCache.delete).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL);
      expect(mockCache.delete).toHaveBeenCalledWith(ToolCacheKeys.MCP_APP_SERVER_SNAPSHOTS);
    });

    it('should NOT use CONFIG_STORE namespace', async () => {
      mockCache.get.mockResolvedValue(null);
      await getCachedTools();
      await getCachedTools({ userId: 'user1', serverName: 'github' });
      mockCache.set.mockResolvedValue(true);
      await setCachedTools({ tool1: {} });
      mockCache.delete.mockResolvedValue(true);
      await invalidateCachedTools({ invalidateGlobal: true });

      const allCalls = getLogStores.mock.calls.flat();
      expect(allCalls).not.toContain(CacheKeys.CONFIG_STORE);
      expect(allCalls.every((key) => key === CacheKeys.TOOL_CACHE)).toBe(true);
    });
  });
});
