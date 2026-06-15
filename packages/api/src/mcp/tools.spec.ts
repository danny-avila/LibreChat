import { Constants } from 'librechat-data-provider';
import type { LCAvailableTools, ParsedServerConfig } from './types';
import type { MCPToolInput, MCPToolCacheDeps } from './tools';
import { createMCPToolCacheService } from './tools';

const requestScopedConfig: ParsedServerConfig = {
  type: 'streamable-http',
  url: 'https://mcp.example.com/{{LIBRECHAT_BODY_CONVERSATIONID}}/mcp',
  source: 'yaml',
};

const cacheableConfig: ParsedServerConfig = {
  type: 'streamable-http',
  url: 'https://mcp.example.com/mcp',
  source: 'yaml',
};

function createMockDeps(overrides: Partial<MCPToolCacheDeps> = {}): MCPToolCacheDeps {
  return {
    getCachedTools: jest.fn().mockResolvedValue(null),
    setCachedTools: jest.fn().mockResolvedValue(true),
    getServerConfig: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('createMCPToolCacheService', () => {
  describe('updateMCPServerTools', () => {
    it('returns empty object for null tools', async () => {
      const deps = createMockDeps();
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      const result = await updateMCPServerTools({ userId: 'u1', serverName: 'srv', tools: null });

      expect(result).toEqual({});
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('returns empty object for empty tools array', async () => {
      const deps = createMockDeps();
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      const result = await updateMCPServerTools({ userId: 'u1', serverName: 'srv', tools: [] });

      expect(result).toEqual({});
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('constructs tool names with mcp_delimiter and caches them', async () => {
      const deps = createMockDeps();
      const { updateMCPServerTools } = createMCPToolCacheService(deps);
      const tools: MCPToolInput[] = [
        {
          name: 'search',
          description: 'Search docs',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const result = await updateMCPServerTools({ userId: 'u1', serverName: 'brave', tools });

      const expectedKey = `search${Constants.mcp_delimiter}brave`;
      expect(result[expectedKey]).toBeDefined();
      expect(result[expectedKey].type).toBe('function');
      expect(result[expectedKey]['function'].name).toBe(expectedKey);
      expect(result[expectedKey]['function'].description).toBe('Search docs');
      expect(deps.setCachedTools).toHaveBeenCalledWith(result, {
        userId: 'u1',
        serverName: 'brave',
      });
    });

    it('builds tool names without caching when the resolved config is request-scoped', async () => {
      const deps = createMockDeps({
        getServerConfig: jest.fn().mockResolvedValue(requestScopedConfig),
      });
      const { updateMCPServerTools } = createMCPToolCacheService(deps);
      const tools: MCPToolInput[] = [
        {
          name: 'search',
          description: 'Search request-scoped docs',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const result = await updateMCPServerTools({
        userId: 'u1',
        serverName: 'body-scoped',
        tools,
      });

      const expectedKey = `search${Constants.mcp_delimiter}body-scoped`;
      expect(result[expectedKey]).toBeDefined();
      expect(deps.getServerConfig).toHaveBeenCalledWith('body-scoped', 'u1');
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('uses a provided serverConfig without calling the resolver', async () => {
      const deps = createMockDeps();
      const { updateMCPServerTools } = createMCPToolCacheService(deps);
      const tools: MCPToolInput[] = [{ name: 'search' }];

      await updateMCPServerTools({
        userId: 'u1',
        serverName: 'body-scoped',
        tools,
        serverConfig: requestScopedConfig,
      });

      expect(deps.getServerConfig).not.toHaveBeenCalled();
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('fails open and caches when config resolution throws', async () => {
      const deps = createMockDeps({
        getServerConfig: jest.fn().mockRejectedValue(new Error('registry not initialized')),
      });
      const { updateMCPServerTools } = createMCPToolCacheService(deps);
      const tools: MCPToolInput[] = [{ name: 'search' }];

      await updateMCPServerTools({ userId: 'u1', serverName: 'srv', tools });

      expect(deps.setCachedTools).toHaveBeenCalled();
    });

    it('propagates setCachedTools errors', async () => {
      const deps = createMockDeps({
        setCachedTools: jest.fn().mockRejectedValue(new Error('Redis down')),
      });
      const { updateMCPServerTools } = createMCPToolCacheService(deps);
      const tools: MCPToolInput[] = [{ name: 'tool1' }];

      await expect(
        updateMCPServerTools({ userId: 'u1', serverName: 'srv', tools }),
      ).rejects.toThrow('Redis down');
    });
  });

  describe('mergeAppTools', () => {
    it('no-ops when appTools is empty', async () => {
      const deps = createMockDeps();
      const { mergeAppTools } = createMCPToolCacheService(deps);

      await mergeAppTools({});

      expect(deps.getCachedTools).not.toHaveBeenCalled();
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('merges app tools with existing cached tools', async () => {
      const existing: LCAvailableTools = {
        old: {
          type: 'function',
          ['function']: {
            name: 'old',
            description: '',
            parameters: { type: 'object', properties: {} },
          },
        },
      };
      const deps = createMockDeps({ getCachedTools: jest.fn().mockResolvedValue(existing) });
      const { mergeAppTools } = createMCPToolCacheService(deps);
      const appTools: LCAvailableTools = {
        new: {
          type: 'function',
          ['function']: {
            name: 'new',
            description: '',
            parameters: { type: 'object', properties: {} },
          },
        },
      };

      await mergeAppTools(appTools);

      expect(deps.setCachedTools).toHaveBeenCalledWith(
        expect.objectContaining({ old: existing.old, new: appTools.new }),
      );
    });

    it('handles null cache (cold start) by defaulting to empty', async () => {
      const deps = createMockDeps({ getCachedTools: jest.fn().mockResolvedValue(null) });
      const { mergeAppTools } = createMCPToolCacheService(deps);
      const appTools: LCAvailableTools = {
        tool: {
          type: 'function',
          ['function']: {
            name: 'tool',
            description: '',
            parameters: { type: 'object', properties: {} },
          },
        },
      };

      await mergeAppTools(appTools);

      expect(deps.setCachedTools).toHaveBeenCalledWith(
        expect.objectContaining({ tool: appTools.tool }),
      );
    });

    it('propagates getCachedTools errors', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockRejectedValue(new Error('cache read failed')),
      });
      const { mergeAppTools } = createMCPToolCacheService(deps);

      await expect(
        mergeAppTools({
          t: {
            type: 'function',
            ['function']: {
              name: 't',
              description: '',
              parameters: { type: 'object', properties: {} },
            },
          },
        }),
      ).rejects.toThrow('cache read failed');
    });
  });

  describe('cacheMCPServerTools', () => {
    const serverTools: LCAvailableTools = {
      tool: {
        type: 'function',
        ['function']: {
          name: 'tool',
          description: '',
          parameters: { type: 'object', properties: {} },
        },
      },
    };

    it('no-ops when serverTools is empty', async () => {
      const deps = createMockDeps();
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await cacheMCPServerTools({ userId: 'u1', serverName: 'srv', serverTools: {} });

      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('caches server tools with userId and serverName', async () => {
      const deps = createMockDeps();
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await cacheMCPServerTools({ userId: 'u1', serverName: 'brave', serverTools });

      expect(deps.setCachedTools).toHaveBeenCalledWith(serverTools, {
        userId: 'u1',
        serverName: 'brave',
      });
    });

    it('skips caching for request-scoped servers', async () => {
      const deps = createMockDeps({
        getServerConfig: jest.fn().mockResolvedValue(requestScopedConfig),
      });
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await cacheMCPServerTools({ userId: 'u1', serverName: 'body-scoped', serverTools });

      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('propagates setCachedTools errors', async () => {
      const deps = createMockDeps({
        setCachedTools: jest.fn().mockRejectedValue(new Error('write failed')),
      });
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await expect(
        cacheMCPServerTools({ userId: 'u1', serverName: 'srv', serverTools }),
      ).rejects.toThrow('write failed');
    });
  });

  describe('getMCPServerTools', () => {
    const cachedTools: LCAvailableTools = {
      tool: {
        type: 'function',
        ['function']: {
          name: 'tool',
          description: '',
          parameters: { type: 'object', properties: {} },
        },
      },
    };

    it('returns cached tools for cacheable servers', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cachedTools),
        getServerConfig: jest.fn().mockResolvedValue(cacheableConfig),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'brave');

      expect(result).toEqual(cachedTools);
      expect(deps.getCachedTools).toHaveBeenCalledWith({ userId: 'u1', serverName: 'brave' });
    });

    it('returns null for request-scoped servers without reading the cache', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cachedTools),
        getServerConfig: jest.fn().mockResolvedValue(requestScopedConfig),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'body-scoped');

      expect(result).toBeNull();
      expect(deps.getCachedTools).not.toHaveBeenCalled();
    });

    it('uses a provided serverConfig without calling the resolver', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cachedTools),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'body-scoped', requestScopedConfig);

      expect(result).toBeNull();
      expect(deps.getServerConfig).not.toHaveBeenCalled();
      expect(deps.getCachedTools).not.toHaveBeenCalled();
    });

    it('returns null when the cache is empty', async () => {
      const deps = createMockDeps();
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'brave');

      expect(result).toBeNull();
    });

    it('returns null instead of throwing when the cache read fails', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockRejectedValue(new Error('cache unavailable')),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'brave');

      expect(result).toBeNull();
    });
  });
});
