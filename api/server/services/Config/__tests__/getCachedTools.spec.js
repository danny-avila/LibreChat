const { CacheKeys } = require('librechat-data-provider');

jest.mock('~/cache/getLogStores');
const getLogStores = require('~/cache/getLogStores');

const mockCache = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };
getLogStores.mockReturnValue(mockCache);

const {
  ToolCacheKeys,
  getCachedTools,
  setCachedTools,
  getMCPServerTools,
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

    it('getMCPServerTools should use TOOL_CACHE namespace', async () => {
      mockCache.get.mockResolvedValue(null);
      await getMCPServerTools('user1', 'github');
      expect(getLogStores).toHaveBeenCalledWith(CacheKeys.TOOL_CACHE);
      expect(mockCache.get).toHaveBeenCalledWith(ToolCacheKeys.MCP_SERVER('user1', 'github'));
    });

    it('should NOT use CONFIG_STORE namespace', async () => {
      mockCache.get.mockResolvedValue(null);
      await getCachedTools();
      await getMCPServerTools('user1', 'github');
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
