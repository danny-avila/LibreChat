const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');

jest.mock('~/cache/getLogStores');

const {
  ToolCacheKeys,
  getCachedTools,
  setCachedTools,
  getMCPServerTools,
  invalidateCachedTools,
} = require('../getCachedTools');

describe('getCachedTools - Cache Isolation Security', () => {
  let mockCache;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    };

    getLogStores.mockReturnValue(mockCache);
  });

  describe('ToolCacheKeys.MCP_SERVER', () => {
    it('should generate cache keys that include userId', () => {
      const key = ToolCacheKeys.MCP_SERVER('user123', 'github');
      expect(key).toBe('tools:mcp:user123:github');
    });

    it('should generate different cache keys for different users with same server', () => {
      const keyUserA = ToolCacheKeys.MCP_SERVER('userA', 'github');
      const keyUserB = ToolCacheKeys.MCP_SERVER('userB', 'github');

      expect(keyUserA).not.toEqual(keyUserB);
      expect(keyUserA).toBe('tools:mcp:userA:github');
      expect(keyUserB).toBe('tools:mcp:userB:github');
    });

    it('should generate different cache keys for same user with different servers', () => {
      const keyGithub = ToolCacheKeys.MCP_SERVER('user123', 'github');
      const keyGitlab = ToolCacheKeys.MCP_SERVER('user123', 'gitlab');

      expect(keyGithub).not.toEqual(keyGitlab);
      expect(keyGithub).toBe('tools:mcp:user123:github');
      expect(keyGitlab).toBe('tools:mcp:user123:gitlab');
    });

    it('should generate unique cache keys for each user-server combination', () => {
      const combinations = [
        ['user1', 'server1'],
        ['user1', 'server2'],
        ['user2', 'server1'],
        ['user2', 'server2'],
      ];

      const keys = combinations.map(([userId, serverName]) =>
        ToolCacheKeys.MCP_SERVER(userId, serverName),
      );

      // All keys should be unique
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });
  });

  describe('getMCPServerTools - User Isolation', () => {
    it('should isolate cache between different users for same server', async () => {
      const serverName = 'github';
      const userATools = { tool1: { name: 'Tool 1' } };
      const userBTools = { tool2: { name: 'Tool 2' } };

      // Mock cache to return different tools for different users
      mockCache.get.mockImplementation((key) => {
        if (key === 'tools:mcp:userA:github') {
          return userATools;
        }
        if (key === 'tools:mcp:userB:github') {
          return userBTools;
        }
        return null;
      });

      // User A should get their tools
      const resultA = await getMCPServerTools('userA', serverName);
      expect(resultA).toEqual(userATools);
      expect(mockCache.get).toHaveBeenCalledWith('tools:mcp:userA:github');

      // User B should get their own different tools
      const resultB = await getMCPServerTools('userB', serverName);
      expect(resultB).toEqual(userBTools);
      expect(mockCache.get).toHaveBeenCalledWith('tools:mcp:userB:github');

      // Verify User A didn't get User B's tools
      expect(resultA).not.toEqual(resultB);
    });

    it('should return null when user has no cached tools for server', async () => {
      mockCache.get.mockResolvedValue(null);

      const result = await getMCPServerTools('userA', 'github');

      expect(result).toBeNull();
      expect(mockCache.get).toHaveBeenCalledWith('tools:mcp:userA:github');
    });

    it('should not leak tools between users even with similar userIds', async () => {
      const userIdA = 'user1';
      const userIdB = 'user10'; // Similar but different
      const serverName = 'github';

      mockCache.get.mockImplementation((key) => {
        if (key === 'tools:mcp:user1:github') {
          return { tool1: {} };
        }
        return null;
      });

      const resultA = await getMCPServerTools(userIdA, serverName);
      const resultB = await getMCPServerTools(userIdB, serverName);

      expect(resultA).toEqual({ tool1: {} });
      expect(resultB).toBeNull(); // user10 should NOT get user1's tools
    });

    it('should call getLogStores with correct cache store', async () => {
      mockCache.get.mockResolvedValue(null);

      await getMCPServerTools('user123', 'github');

      expect(getLogStores).toHaveBeenCalledWith(CacheKeys.CONFIG_STORE);
    });
  });

  describe('setCachedTools - User Isolation', () => {
    it('should cache tools with userId in the key', async () => {
      const tools = { tool1: { name: 'Tool 1' } };
      const userId = 'user123';
      const serverName = 'github';

      await setCachedTools(tools, { userId, serverName });

      expect(mockCache.set).toHaveBeenCalledWith('tools:mcp:user123:github', tools, undefined);
    });

    it('should cache tools separately for different users', async () => {
      const toolsA = { tool1: { name: 'Tool A' } };
      const toolsB = { tool2: { name: 'Tool B' } };
      const serverName = 'github';

      await setCachedTools(toolsA, { userId: 'userA', serverName });
      await setCachedTools(toolsB, { userId: 'userB', serverName });

      expect(mockCache.set).toHaveBeenCalledWith('tools:mcp:userA:github', toolsA, undefined);
      expect(mockCache.set).toHaveBeenCalledWith('tools:mcp:userB:github', toolsB, undefined);
    });

    it('should support TTL parameter', async () => {
      const tools = { tool1: {} };
      const ttl = 60000;

      await setCachedTools(tools, {
        userId: 'user123',
        serverName: 'github',
        ttl,
      });

      expect(mockCache.set).toHaveBeenCalledWith('tools:mcp:user123:github', tools, ttl);
    });

    it('should fall back to global cache when no userId provided', async () => {
      const tools = { global_tool: {} };

      await setCachedTools(tools, { serverName: 'github' }); // No userId

      expect(mockCache.set).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL, tools, undefined);
    });

    it('should fall back to global cache when no serverName provided', async () => {
      const tools = { global_tool: {} };

      await setCachedTools(tools, { userId: 'user123' }); // No serverName

      expect(mockCache.set).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL, tools, undefined);
    });
  });

  describe('getCachedTools - User Isolation', () => {
    it('should retrieve MCP tools for specific user and server', async () => {
      const tools = { tool1: {} };
      mockCache.get.mockResolvedValue(tools);

      const result = await getCachedTools({
        userId: 'user123',
        serverName: 'github',
      });

      expect(result).toEqual(tools);
      expect(mockCache.get).toHaveBeenCalledWith('tools:mcp:user123:github');
    });

    it('should retrieve global tools when no userId/serverName provided', async () => {
      const globalTools = { global_tool: {} };
      mockCache.get.mockResolvedValue(globalTools);

      const result = await getCachedTools();

      expect(result).toEqual(globalTools);
      expect(mockCache.get).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL);
    });

    it('should fall back to global tools when only serverName provided', async () => {
      const globalTools = { global_tool: {} };
      mockCache.get.mockResolvedValue(globalTools);

      const result = await getCachedTools({ serverName: 'github' }); // No userId

      expect(result).toEqual(globalTools);
      expect(mockCache.get).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL);
    });

    it('should fall back to global tools when only userId provided', async () => {
      const globalTools = { global_tool: {} };
      mockCache.get.mockResolvedValue(globalTools);

      const result = await getCachedTools({ userId: 'user123' }); // No serverName

      expect(result).toEqual(globalTools);
      expect(mockCache.get).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL);
    });
  });

  describe('invalidateCachedTools - User Isolation', () => {
    it('should invalidate cache for specific user and server', async () => {
      await invalidateCachedTools({
        userId: 'user123',
        serverName: 'github',
      });

      expect(mockCache.delete).toHaveBeenCalledWith('tools:mcp:user123:github');
    });

    it('should invalidate only specified user cache, not others', async () => {
      await invalidateCachedTools({
        userId: 'userA',
        serverName: 'github',
      });

      expect(mockCache.delete).toHaveBeenCalledTimes(1);
      expect(mockCache.delete).toHaveBeenCalledWith('tools:mcp:userA:github');
      expect(mockCache.delete).not.toHaveBeenCalledWith('tools:mcp:userB:github');
    });

    it('should invalidate global cache when specified', async () => {
      await invalidateCachedTools({ invalidateGlobal: true });

      expect(mockCache.delete).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL);
    });

    it('should invalidate both user-specific and global cache when requested', async () => {
      await invalidateCachedTools({
        userId: 'user123',
        serverName: 'github',
        invalidateGlobal: true,
      });

      expect(mockCache.delete).toHaveBeenCalledWith('tools:mcp:user123:github');
      expect(mockCache.delete).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL);
      expect(mockCache.delete).toHaveBeenCalledTimes(2);
    });

    it('should not invalidate anything when only userId provided without serverName', async () => {
      await invalidateCachedTools({ userId: 'user123' }); // No serverName

      expect(mockCache.delete).not.toHaveBeenCalled();
    });

    it('should not invalidate anything when only serverName provided without userId', async () => {
      await invalidateCachedTools({ serverName: 'github' }); // No userId

      expect(mockCache.delete).not.toHaveBeenCalled();
    });
  });

  describe('Security - Cross-User Cache Leakage Prevention', () => {
    it('should prevent User B from accessing User A cached tools by serverName alone', async () => {
      // User A caches tools
      const userATools = { sensitive_tool: { token: 'secret-token-A' } };
      mockCache.set.mockResolvedValue(true);
      await setCachedTools(userATools, { userId: 'userA', serverName: 'github' });

      // Simulate cache state
      const cacheState = {
        'tools:mcp:userA:github': userATools,
      };

      mockCache.get.mockImplementation((key) => cacheState[key] || null);

      // User B tries to get tools (should NOT get User A's tools)
      const userBResult = await getMCPServerTools('userB', 'github');

      expect(userBResult).toBeNull();
      expect(mockCache.get).toHaveBeenCalledWith('tools:mcp:userB:github');
      expect(mockCache.get).not.toHaveBeenCalledWith('tools:mcp:userA:github');
    });

    it('should maintain isolation even with rapid successive cache operations', async () => {
      const cacheState = {};

      mockCache.set.mockImplementation((key, value) => {
        cacheState[key] = value;
        return Promise.resolve(true);
      });

      mockCache.get.mockImplementation((key) => Promise.resolve(cacheState[key] || null));

      // Multiple users cache tools simultaneously
      await Promise.all([
        setCachedTools({ tool1: 'A' }, { userId: 'user1', serverName: 'github' }),
        setCachedTools({ tool1: 'B' }, { userId: 'user2', serverName: 'github' }),
        setCachedTools({ tool1: 'C' }, { userId: 'user3', serverName: 'github' }),
      ]);

      // Each user should get their own tools
      const result1 = await getMCPServerTools('user1', 'github');
      const result2 = await getMCPServerTools('user2', 'github');
      const result3 = await getMCPServerTools('user3', 'github');

      expect(result1).toEqual({ tool1: 'A' });
      expect(result2).toEqual({ tool1: 'B' });
      expect(result3).toEqual({ tool1: 'C' });
    });

    it('should not allow cache key injection via userId parameter', async () => {
      // Attempt to inject cache key to access another user's cache
      const maliciousUserId = "userA:github'}; return cachedTools['tools:mcp:userB";
      const serverName = 'github';

      const tools = { malicious_tool: {} };
      await setCachedTools(tools, { userId: maliciousUserId, serverName });

      // Should create a unique (escaped) key, not access another user's cache
      const expectedKey = `tools:mcp:${maliciousUserId}:${serverName}`;
      expect(mockCache.set).toHaveBeenCalledWith(expectedKey, tools, undefined);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined userId gracefully', async () => {
      const tools = { tool1: {} };

      await setCachedTools(tools, { userId: undefined, serverName: 'github' });

      // Should fall back to global cache
      expect(mockCache.set).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL, tools, undefined);
    });

    it('should handle null userId gracefully', async () => {
      const tools = { tool1: {} };

      await setCachedTools(tools, { userId: null, serverName: 'github' });

      // Should fall back to global cache
      expect(mockCache.set).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL, tools, undefined);
    });

    it('should handle empty string userId', async () => {
      const tools = { tool1: {} };

      await setCachedTools(tools, { userId: '', serverName: 'github' });

      // Empty string is falsy, should fall back to global cache
      expect(mockCache.set).toHaveBeenCalledWith(ToolCacheKeys.GLOBAL, tools, undefined);
    });

    it('should handle special characters in userId', async () => {
      const userId = 'user@example.com';
      const serverName = 'github';
      const tools = { tool1: {} };

      await setCachedTools(tools, { userId, serverName });

      expect(mockCache.set).toHaveBeenCalledWith(
        'tools:mcp:user@example.com:github',
        tools,
        undefined,
      );
    });

    it('should handle special characters in serverName', async () => {
      const userId = 'user123';
      const serverName = 'my-server:8080';
      const tools = { tool1: {} };

      await setCachedTools(tools, { userId, serverName });

      expect(mockCache.set).toHaveBeenCalledWith(
        'tools:mcp:user123:my-server:8080',
        tools,
        undefined,
      );
    });
  });
});
