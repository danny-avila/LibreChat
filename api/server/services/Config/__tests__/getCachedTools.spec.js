const { CacheKeys } = require('librechat-data-provider');

jest.mock('~/cache/getLogStores');
const getLogStores = require('~/cache/getLogStores');

const mockCache = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };
getLogStores.mockReturnValue(mockCache);

const {
  ToolCacheKeys,
  getCachedTools,
  setCachedTools,
  invalidateCachedTools,
} = require('../getCachedTools');

describe('getCachedTools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getLogStores.mockReturnValue(mockCache);
  });

  describe('ToolCacheKeys.MCP_SERVER', () => {
    it('should generate opaque cache keys scoped to tenant, user, and server', () => {
      const key = ToolCacheKeys.MCP_SERVER('user123', 'github', 'tenant-a');
      expect(key).toMatch(/^tools:mcp:v2:/);
      expect(key).not.toContain('tenant-a');
      expect(key).not.toContain('user123');
      expect(key).not.toContain('github');
      expect(ToolCacheKeys.MCP_SERVER('user123', 'github', 'tenant-a')).toBe(key);
      expect(ToolCacheKeys.MCP_SERVER('user123', 'github', 'tenant-b')).not.toBe(key);
    });
  });

  describe('TOOL_CACHE namespace usage', () => {
    it('surfaces a legacy key only to the single-tenant cold-cache validator', async () => {
      const legacyTools = { tool1: {} };
      mockCache.get.mockResolvedValueOnce(null).mockResolvedValueOnce(legacyTools);

      await expect(
        getCachedTools({ userId: 'user1', serverName: 'github', tenantId: undefined }),
      ).resolves.toBe(legacyTools);

      expect(mockCache.get).toHaveBeenNthCalledWith(
        1,
        ToolCacheKeys.MCP_SERVER('user1', 'github', undefined),
      );
      expect(mockCache.get).toHaveBeenNthCalledWith(
        2,
        ToolCacheKeys.LEGACY_MCP_SERVER('user1', 'github'),
      );
    });

    it('never reads an unscoped legacy key for a tenant-scoped request', async () => {
      mockCache.get.mockResolvedValue(null);

      await expect(
        getCachedTools({ userId: 'user1', serverName: 'github', tenantId: 'tenant-a' }),
      ).resolves.toBeNull();

      expect(mockCache.get).toHaveBeenCalledTimes(1);
      expect(mockCache.get).toHaveBeenCalledWith(
        ToolCacheKeys.MCP_SERVER('user1', 'github', 'tenant-a'),
      );
    });

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
      expect(mockCache.set).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL, tools, expect.any(Number));
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

    it('invalidateCachedTools should use TOOL_CACHE namespace', async () => {
      mockCache.delete.mockResolvedValue(true);
      await invalidateCachedTools({ invalidateGlobal: true });
      expect(getLogStores).toHaveBeenCalledWith(CacheKeys.TOOL_CACHE);
      expect(mockCache.delete).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL);
    });

    it('does not delete an unscoped legacy key from a tenant-scoped invalidation', async () => {
      mockCache.delete.mockResolvedValue(true);

      await invalidateCachedTools({
        userId: 'user1',
        serverName: 'github',
        tenantId: 'tenant-a',
      });

      expect(mockCache.delete).toHaveBeenCalledTimes(1);
      expect(mockCache.delete).toHaveBeenCalledWith(
        ToolCacheKeys.MCP_SERVER('user1', 'github', 'tenant-a'),
      );
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
