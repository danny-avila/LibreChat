import { Constants } from 'librechat-data-provider';
import { createMCPToolCacheService } from './tools';
import type { LCAvailableTools } from './types';
import type { MCPToolInput, MCPToolCacheDeps } from './tools';

function createMockDeps(overrides: Partial<MCPToolCacheDeps> = {}): MCPToolCacheDeps {
  return {
    getCachedTools: jest.fn().mockResolvedValue(null),
    setCachedTools: jest.fn().mockResolvedValue(true),
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
    it('no-ops when serverTools is empty', async () => {
      const deps = createMockDeps();
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await cacheMCPServerTools({ userId: 'u1', serverName: 'srv', serverTools: {} });

      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('caches server tools with userId and serverName', async () => {
      const deps = createMockDeps();
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);
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

      await cacheMCPServerTools({ userId: 'u1', serverName: 'brave', serverTools });

      expect(deps.setCachedTools).toHaveBeenCalledWith(serverTools, {
        userId: 'u1',
        serverName: 'brave',
      });
    });

    it('propagates setCachedTools errors', async () => {
      const deps = createMockDeps({
        setCachedTools: jest.fn().mockRejectedValue(new Error('write failed')),
      });
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await expect(
        cacheMCPServerTools({
          userId: 'u1',
          serverName: 'srv',
          serverTools: {
            t: {
              type: 'function',
              ['function']: {
                name: 't',
                description: '',
                parameters: { type: 'object', properties: {} },
              },
            },
          },
        }),
      ).rejects.toThrow('write failed');
    });
  });
});
