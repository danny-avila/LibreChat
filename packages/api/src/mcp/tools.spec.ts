import { Constants, normalizeServerName } from 'librechat-data-provider';
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

const userScopedConfig: ParsedServerConfig = {
  ...cacheableConfig,
  requiresOAuth: true,
};

const lazyConfig: ParsedServerConfig = {
  ...cacheableConfig,
  startup: false,
};

const tenantConfig: ParsedServerConfig = {
  ...cacheableConfig,
  source: 'config',
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
  describe('replaceAppServerTools', () => {
    const toolName = (name: string, server: string) => `${name}${Constants.mcp_delimiter}${server}`;

    it('drops tools the server no longer reports and keeps other servers untouched', async () => {
      const cached: LCAvailableTools = {
        [toolName('gone', 'dynamic')]: { type: 'function', function: { name: 'gone' } },
        [toolName('stays', 'dynamic')]: { type: 'function', function: { name: 'stays' } },
        [toolName('other', 'unrelated')]: { type: 'function', function: { name: 'other' } },
      };
      const deps = createMockDeps({ getCachedTools: jest.fn().mockResolvedValue(cached) });
      const service = createMCPToolCacheService(deps);

      const serverTools: LCAvailableTools = {
        [toolName('stays', 'dynamic')]: { type: 'function', function: { name: 'stays' } },
        [toolName('added', 'dynamic')]: { type: 'function', function: { name: 'added' } },
      };

      await service.replaceAppServerTools({ serverName: 'dynamic', serverTools });

      expect(deps.setCachedTools).toHaveBeenCalledWith({
        [toolName('other', 'unrelated')]: cached[toolName('other', 'unrelated')],
        ...serverTools,
      });
    });

    it('clears a server that now reports no tools at all', async () => {
      const cached: LCAvailableTools = {
        [toolName('gone', 'dynamic')]: { type: 'function', function: { name: 'gone' } },
      };
      const deps = createMockDeps({ getCachedTools: jest.fn().mockResolvedValue(cached) });
      const service = createMCPToolCacheService(deps);

      await service.replaceAppServerTools({ serverName: 'dynamic', serverTools: {} });

      expect(deps.setCachedTools).toHaveBeenCalledWith({});
    });

    it('records an authoritative empty app snapshot', async () => {
      const getCachedAppServerSnapshots = jest.fn().mockResolvedValue(['other']);
      const setCachedAppServerSnapshots = jest.fn().mockResolvedValue(true);
      const deps = createMockDeps({
        getCachedAppServerSnapshots,
        setCachedAppServerSnapshots,
      });
      const service = createMCPToolCacheService(deps);

      await service.replaceAppServerTools({ serverName: 'dynamic', serverTools: {} });

      expect(setCachedAppServerSnapshots).toHaveBeenCalledWith(['other', 'dynamic']);
    });

    it('starts from an empty cache without failing', async () => {
      const deps = createMockDeps();
      const service = createMCPToolCacheService(deps);
      const serverTools: LCAvailableTools = {
        [toolName('first', 'dynamic')]: { type: 'function', function: { name: 'first' } },
      };

      await service.replaceAppServerTools({ serverName: 'dynamic', serverTools });

      expect(deps.setCachedTools).toHaveBeenCalledWith(serverTools);
    });

    it('propagates a cache write failure', async () => {
      const deps = createMockDeps({
        setCachedTools: jest.fn().mockRejectedValue(new Error('Redis down')),
      });
      const service = createMCPToolCacheService(deps);

      await expect(
        service.replaceAppServerTools({ serverName: 'dynamic', serverTools: {} }),
      ).rejects.toThrow('Redis down');
    });

    it('treats a rejected cache write result as a failure', async () => {
      const deps = createMockDeps({ setCachedTools: jest.fn().mockResolvedValue(false) });
      const service = createMCPToolCacheService(deps);

      await expect(
        service.replaceAppServerTools({ serverName: 'dynamic', serverTools: {} }),
      ).rejects.toThrow('Tool cache rejected the write');
    });

    it('matches cached keys by the normalized server name', async () => {
      const serverName = 'Dynamic Server';
      const normalized = normalizeServerName(serverName);
      const cached: LCAvailableTools = {
        [toolName('gone', normalized)]: { type: 'function', function: { name: 'gone' } },
      };
      const deps = createMockDeps({ getCachedTools: jest.fn().mockResolvedValue(cached) });
      const service = createMCPToolCacheService(deps);

      await service.replaceAppServerTools({ serverName, serverTools: {} });

      expect(deps.setCachedTools).toHaveBeenCalledWith({});
    });

    it('drops legacy keys that still use the raw server name', async () => {
      const serverName = 'Dynamic Server';
      const legacyKey = toolName('gone', serverName);
      const cached: LCAvailableTools = {
        [legacyKey]: { type: 'function', function: { name: legacyKey } },
      };
      const deps = createMockDeps({ getCachedTools: jest.fn().mockResolvedValue(cached) });
      const service = createMCPToolCacheService(deps);

      await service.replaceAppServerTools({ serverName, serverTools: {} });

      expect(deps.setCachedTools).toHaveBeenCalledWith({});
    });

    it('preserves a longer delimiter-overlapping server boundary', async () => {
      const shortServerKey = toolName('short', 'bar');
      const longServerKey = toolName('long', 'foo_mcp_bar');
      const cached: LCAvailableTools = {
        [shortServerKey]: { type: 'function', function: { name: shortServerKey } },
        [longServerKey]: { type: 'function', function: { name: longServerKey } },
      };
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cached),
        getAllServerConfigs: jest.fn().mockResolvedValue({
          bar: cacheableConfig,
          foo_mcp_bar: cacheableConfig,
        }),
      });
      const service = createMCPToolCacheService(deps);

      await service.replaceAppServerTools({ serverName: 'bar', serverTools: {} });

      expect(deps.setCachedTools).toHaveBeenCalledWith({
        [longServerKey]: cached[longServerKey],
      });
    });

    it('does not replace tools when app server boundaries cannot be resolved', async () => {
      const deps = createMockDeps({
        getAllServerConfigs: jest.fn().mockRejectedValue(new Error('registry unavailable')),
      });
      const service = createMCPToolCacheService(deps);

      await expect(
        service.replaceAppServerTools({ serverName: 'bar', serverTools: {} }),
      ).rejects.toThrow('registry unavailable');

      expect(deps.getCachedTools).not.toHaveBeenCalled();
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('keeps an exact safe name authoritative over a normalized-name collision', async () => {
      const exactServerKey = toolName('exact', 'foo_bar');
      const cached: LCAvailableTools = {
        [exactServerKey]: { type: 'function', function: { name: exactServerKey } },
      };
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cached),
        getAllServerConfigs: jest.fn().mockResolvedValue({
          'foo bar': cacheableConfig,
          foo_bar: cacheableConfig,
        }),
      });
      const service = createMCPToolCacheService(deps);

      await service.replaceAppServerTools({ serverName: 'foo bar', serverTools: {} });

      expect(deps.setCachedTools).toHaveBeenCalledWith(cached);
    });

    it('excludes user-managed server names from app boundary ownership', async () => {
      const operatorKey = toolName('operator', 'foo_bar');
      const cached: LCAvailableTools = {
        [operatorKey]: { type: 'function', function: { name: operatorKey } },
      };
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cached),
        getAllServerConfigs: jest.fn().mockResolvedValue({
          'foo bar': cacheableConfig,
          foo_bar: { ...cacheableConfig, source: 'user' },
        }),
      });
      const service = createMCPToolCacheService(deps);

      await service.replaceAppServerTools({ serverName: 'foo bar', serverTools: {} });

      expect(deps.setCachedTools).toHaveBeenCalledWith({});
    });

    it('rejects a normalized-name collision that resolves to another server', async () => {
      const shadowedKey = toolName('shadowed', 'foo_bar');
      const deps = createMockDeps({
        getAllServerConfigs: jest.fn().mockResolvedValue({
          'foo bar': cacheableConfig,
          foo_bar: cacheableConfig,
        }),
      });
      const service = createMCPToolCacheService(deps);

      await expect(
        service.replaceAppServerTools({
          serverName: 'foo bar',
          serverTools: {
            [shadowedKey]: { type: 'function', function: { name: shadowedKey } },
          },
        }),
      ).rejects.toThrow('belongs to app server foo_bar');

      expect(deps.getCachedTools).not.toHaveBeenCalled();
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('serializes concurrent app-level replacements so one server cannot overwrite another', async () => {
      let cache: LCAvailableTools = {};
      const deps = createMockDeps({
        getCachedTools: jest.fn(async () => cache),
        setCachedTools: jest.fn(async (tools: LCAvailableTools) => {
          cache = tools;
          return true;
        }),
      });
      const service = createMCPToolCacheService(deps);
      const first: LCAvailableTools = {
        [toolName('one', 'first')]: { type: 'function', function: { name: 'one' } },
      };
      const second: LCAvailableTools = {
        [toolName('two', 'second')]: { type: 'function', function: { name: 'two' } },
      };

      await Promise.all([
        service.replaceAppServerTools({ serverName: 'first', serverTools: first }),
        service.replaceAppServerTools({ serverName: 'second', serverTools: second }),
      ]);

      expect(cache).toEqual({ ...first, ...second });
    });

    it('runs app-level replacements inside the shared cache lock when provided', async () => {
      const lockEntered = jest.fn();
      const runWithGlobalCacheLock = async <T>(operation: () => Promise<T>): Promise<T> => {
        lockEntered();
        return operation();
      };
      const deps = createMockDeps({ runWithGlobalCacheLock });
      const service = createMCPToolCacheService(deps);

      await service.replaceAppServerTools({ serverName: 'dynamic', serverTools: {} });

      expect(lockEntered).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateMCPServerTools', () => {
    it('returns empty object for null tools', async () => {
      const deps = createMockDeps();
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      const result = await updateMCPServerTools({ userId: 'u1', serverName: 'srv', tools: null });

      expect(result).toEqual({});
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('replaces a stale cache entry when the server returns an empty tools array', async () => {
      const deps = createMockDeps();
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      const result = await updateMCPServerTools({ userId: 'u1', serverName: 'srv', tools: [] });

      expect(result).toEqual({});
      expect(deps.setCachedTools).toHaveBeenCalledWith({}, { userId: 'u1', serverName: 'srv' });
    });

    it('fences a stale cross-replica publication without retrying it', async () => {
      const setCachedToolsIfCurrent = jest.fn().mockResolvedValue(false);
      const deps = createMockDeps({ setCachedToolsIfCurrent });
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      await expect(
        updateMCPServerTools({
          userId: 'u1',
          serverName: 'srv',
          tools: [{ name: 'stale' }],
          publicationGeneration: 'old-generation',
        }),
      ).resolves.toBeDefined();

      expect(setCachedToolsIfCurrent).toHaveBeenCalledWith(expect.any(Object), {
        userId: 'u1',
        serverName: 'srv',
        publicationGeneration: 'old-generation',
      });
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('publishes a connection snapshot while its distributed generation is current', async () => {
      const setCachedToolsIfCurrent = jest.fn().mockResolvedValue(true);
      const deps = createMockDeps({ setCachedToolsIfCurrent });
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      await updateMCPServerTools({
        userId: 'u1',
        serverName: 'srv',
        tools: [{ name: 'current' }],
        publicationGeneration: 'current-generation',
      });

      expect(setCachedToolsIfCurrent).toHaveBeenCalledTimes(1);
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('does not fall back to an unfenced user write when the generation is missing', async () => {
      const setCachedToolsIfCurrent = jest.fn().mockResolvedValue(true);
      const deps = createMockDeps({ setCachedToolsIfCurrent });
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      await updateMCPServerTools({
        userId: 'u1',
        serverName: 'srv',
        tools: [{ name: 'unknown-origin' }],
      });

      expect(setCachedToolsIfCurrent).not.toHaveBeenCalled();
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('replaces the app-level server slice when no user scope is provided', async () => {
      const staleName = `stale${Constants.mcp_delimiter}srv`;
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue({
          [staleName]: { type: 'function', function: { name: staleName } },
        }),
      });
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      await updateMCPServerTools({ serverName: 'srv', tools: [] });

      expect(deps.setCachedTools).toHaveBeenCalledWith({});
    });

    it('restores an app-owned server to the global cache from a user reinitialization', async () => {
      const deps = createMockDeps({
        getAllServerConfigs: jest.fn().mockResolvedValue({ brave: cacheableConfig }),
      });
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      const result = await updateMCPServerTools({
        userId: 'u1',
        serverName: 'brave',
        serverConfig: cacheableConfig,
        tools: [{ name: 'search' }],
      });

      expect(deps.setCachedTools).toHaveBeenCalledWith(result);
      expect(deps.setCachedTools).not.toHaveBeenCalledWith(result, {
        userId: 'u1',
        serverName: 'brave',
      });
    });

    it('keeps tenant config-only refreshes in the user cache', async () => {
      const deps = createMockDeps({
        getAllServerConfigs: jest.fn().mockResolvedValue({}),
      });
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      const result = await updateMCPServerTools({
        userId: 'tenant-user',
        serverName: 'tenant-only',
        serverConfig: tenantConfig,
        tools: [{ name: 'search' }],
      });

      expect(deps.setCachedTools).toHaveBeenCalledWith(result, {
        userId: 'tenant-user',
        serverName: 'tenant-only',
      });
      expect(deps.setCachedTools).not.toHaveBeenCalledWith(result);
    });

    it('keeps same-name tenant overrides of app servers in the user cache', async () => {
      const tenantOverride = { ...cacheableConfig, url: 'https://tenant.example.com/mcp' };
      const deps = createMockDeps({
        isAppServerConfig: jest.fn().mockResolvedValue(false),
        getAllServerConfigs: jest.fn().mockResolvedValue({ brave: cacheableConfig }),
      });
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      const result = await updateMCPServerTools({
        userId: 'tenant-user',
        serverName: 'brave',
        serverConfig: tenantOverride,
        tools: [{ name: 'tenant-search' }],
      });

      expect(deps.setCachedTools).toHaveBeenCalledWith(result, {
        userId: 'tenant-user',
        serverName: 'brave',
      });
      expect(deps.setCachedTools).not.toHaveBeenCalledWith(result);
    });

    it('builds MODEL-FACING keys with the normalized server name, store keyed raw', async () => {
      /** Tool keys become builder tool ids, agent.tools entries, tool_options
       *  keys, and definition names, and must equal the runtime instance name,
       *  which embeds `normalizeServerName(serverName)`. */
      const deps = createMockDeps();
      const { updateMCPServerTools } = createMCPToolCacheService(deps);
      const tools: MCPToolInput[] = [
        { name: 'search', description: 'Search', inputSchema: { type: 'object', properties: {} } },
      ];

      const result = await updateMCPServerTools({
        userId: 'u1',
        serverName: 'Connector: Company',
        tools,
      });

      const expectedKey = `search${Constants.mcp_delimiter}Connector__Company`;
      expect(result[expectedKey]).toBeDefined();
      expect(result[expectedKey]['function'].name).toBe(expectedKey);
      expect(deps.setCachedTools).toHaveBeenCalledWith(result, {
        userId: 'u1',
        serverName: 'Connector: Company',
      });
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

    it('propagates a rejected cache write result so publication can retry', async () => {
      const deps = createMockDeps({ setCachedTools: jest.fn().mockResolvedValue(false) });
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      await expect(
        updateMCPServerTools({ userId: 'u1', serverName: 'srv', tools: [] }),
      ).rejects.toThrow('Tool cache rejected the write');
    });
  });

  describe('mergeAppTools', () => {
    it('clears stale app MCP tools when the startup snapshot is empty', async () => {
      const staleKey = `stale${Constants.mcp_delimiter}removed-server`;
      const cached: LCAvailableTools = {
        builtin: { type: 'function', function: { name: 'builtin' } },
        [staleKey]: { type: 'function', function: { name: staleKey } },
      };
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cached),
        getCachedAppServerSnapshots: jest.fn().mockResolvedValue(['removed-server']),
      });
      const { mergeAppTools } = createMCPToolCacheService(deps);

      await mergeAppTools({});

      expect(deps.setCachedTools).toHaveBeenCalledWith({ builtin: cached.builtin });
    });

    it('preserves non-MCP tools whose names contain the MCP delimiter', async () => {
      const regularKey = `get${Constants.mcp_delimiter}status`;
      const cached: LCAvailableTools = {
        [regularKey]: { type: 'function', function: { name: regularKey } },
      };
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cached),
        getAllServerConfigs: jest.fn().mockResolvedValue({
          brave: { ...cacheableConfig, toolFunctions: {} },
        }),
      });
      const { mergeAppTools } = createMCPToolCacheService(deps);

      await mergeAppTools({});

      expect(deps.setCachedTools).toHaveBeenCalledWith(cached);
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

    it('replaces stale snapshot markers with successfully inspected operator servers', async () => {
      const setCachedAppServerSnapshots = jest.fn().mockResolvedValue(true);
      const deps = createMockDeps({
        setCachedAppServerSnapshots,
        getAllServerConfigs: jest.fn().mockResolvedValue({
          empty: { ...cacheableConfig, toolFunctions: {} },
          failed: { ...cacheableConfig, toolFunctions: null },
          public: { ...cacheableConfig, source: 'user', toolFunctions: {} },
        }),
      });
      const { mergeAppTools } = createMCPToolCacheService(deps);

      await mergeAppTools({});

      expect(setCachedAppServerSnapshots).toHaveBeenCalledWith(['empty']);
    });

    it('preserves a known-good server slice when startup inspection is incomplete', async () => {
      const failedKey = `known${Constants.mcp_delimiter}failed`;
      const removedKey = `gone${Constants.mcp_delimiter}removed`;
      const cached: LCAvailableTools = {
        [failedKey]: { type: 'function', function: { name: failedKey } },
        [removedKey]: { type: 'function', function: { name: removedKey } },
      };
      const setCachedAppServerSnapshots = jest.fn().mockResolvedValue(true);
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cached),
        getCachedAppServerSnapshots: jest.fn().mockResolvedValue(['failed', 'removed']),
        setCachedAppServerSnapshots,
        getAllServerConfigs: jest.fn().mockResolvedValue({
          failed: { ...cacheableConfig, toolFunctions: undefined },
        }),
      });
      const { mergeAppTools } = createMCPToolCacheService(deps);

      await mergeAppTools({});

      expect(deps.setCachedTools).toHaveBeenCalledWith({ [failedKey]: cached[failedKey] });
      expect(setCachedAppServerSnapshots).toHaveBeenCalledWith(['failed']);
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

    it('caches an empty user snapshot authoritatively', async () => {
      const deps = createMockDeps();
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await cacheMCPServerTools({ userId: 'u1', serverName: 'srv', serverTools: {} });

      expect(deps.setCachedTools).toHaveBeenCalledWith({}, { userId: 'u1', serverName: 'srv' });
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

    it('uses the generation guard for a connection-bound discovery snapshot', async () => {
      const setCachedToolsIfCurrent = jest.fn().mockResolvedValue(true);
      const deps = createMockDeps({ setCachedToolsIfCurrent });
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await cacheMCPServerTools({
        userId: 'u1',
        serverName: 'brave',
        serverTools,
        publicationGeneration: 'generation-current',
      });

      expect(setCachedToolsIfCurrent).toHaveBeenCalledWith(serverTools, {
        userId: 'u1',
        serverName: 'brave',
        publicationGeneration: 'generation-current',
      });
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('does not cache an unfenced discovery snapshot when the guard is configured', async () => {
      const setCachedToolsIfCurrent = jest.fn().mockResolvedValue(true);
      const deps = createMockDeps({ setCachedToolsIfCurrent });
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await cacheMCPServerTools({ userId: 'u1', serverName: 'brave', serverTools });

      expect(setCachedToolsIfCurrent).not.toHaveBeenCalled();
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('refreshes the global server slice for an app-shared server', async () => {
      const deps = createMockDeps();
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await cacheMCPServerTools({
        userId: 'u1',
        serverName: 'brave',
        serverTools,
        serverConfig: cacheableConfig,
      });

      expect(deps.setCachedTools).toHaveBeenCalledWith(serverTools);
      expect(deps.setCachedTools).not.toHaveBeenCalledWith(serverTools, {
        userId: 'u1',
        serverName: 'brave',
      });
    });

    it('keeps a tenant config-only server out of the global cache', async () => {
      const deps = createMockDeps({
        getAllServerConfigs: jest.fn().mockResolvedValue({}),
      });
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await cacheMCPServerTools({
        userId: 'tenant-user',
        serverName: 'tenant-only',
        serverTools,
        serverConfig: tenantConfig,
      });

      expect(deps.setCachedTools).toHaveBeenCalledWith(serverTools, {
        userId: 'tenant-user',
        serverName: 'tenant-only',
      });
      expect(deps.setCachedTools).not.toHaveBeenCalledWith(serverTools);
    });

    it('keeps startup-disabled server tools in the user cache', async () => {
      const deps = createMockDeps();
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await cacheMCPServerTools({
        userId: 'u1',
        serverName: 'lazy',
        serverTools,
        serverConfig: lazyConfig,
      });

      expect(deps.setCachedTools).toHaveBeenCalledWith(serverTools, {
        userId: 'u1',
        serverName: 'lazy',
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

    it('returns per-user cached tools for user-scoped servers', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cachedTools),
        getServerConfig: jest.fn().mockResolvedValue(userScopedConfig),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'brave');

      expect(result).toEqual(cachedTools);
      expect(deps.getCachedTools).toHaveBeenCalledWith({ userId: 'u1', serverName: 'brave' });
    });

    it('reads an app-shared server from the global catalog instead of a stale user snapshot', async () => {
      const staleKey = `stale${Constants.mcp_delimiter}brave`;
      const currentKey = `current${Constants.mcp_delimiter}brave`;
      const unrelatedKey = `other${Constants.mcp_delimiter}unrelated`;
      const stale: LCAvailableTools = {
        [staleKey]: { type: 'function', function: { name: staleKey } },
      };
      const current: LCAvailableTools = {
        [currentKey]: { type: 'function', function: { name: currentKey } },
        [unrelatedKey]: { type: 'function', function: { name: unrelatedKey } },
      };
      const getCachedTools = jest.fn(async (options?: { userId?: string }) =>
        options?.userId ? stale : current,
      );
      const deps = createMockDeps({
        getCachedTools,
        getServerConfig: jest.fn().mockResolvedValue(cacheableConfig),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'brave');

      expect(result).toEqual({ [currentKey]: current[currentKey] });
      expect(getCachedTools).toHaveBeenCalledWith();
      expect(getCachedTools).not.toHaveBeenCalledWith({ userId: 'u1', serverName: 'brave' });
    });

    it('reads a tenant config-only server from its user cache', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cachedTools),
        getServerConfig: jest.fn().mockResolvedValue(tenantConfig),
        getAllServerConfigs: jest.fn().mockResolvedValue({}),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('tenant-user', 'tenant-only', tenantConfig);

      expect(result).toEqual(cachedTools);
      expect(deps.getCachedTools).toHaveBeenCalledWith({
        userId: 'tenant-user',
        serverName: 'tenant-only',
      });
      expect(deps.getCachedTools).not.toHaveBeenCalledWith();
    });

    it('reads a same-name tenant override from its user cache', async () => {
      const tenantOverride = { ...cacheableConfig, url: 'https://tenant.example.com/mcp' };
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cachedTools),
        getServerConfig: jest.fn().mockResolvedValue(tenantOverride),
        getAllServerConfigs: jest.fn().mockResolvedValue({ brave: cacheableConfig }),
        isAppServerConfig: jest.fn().mockResolvedValue(false),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('tenant-user', 'brave', tenantOverride);

      expect(result).toEqual(cachedTools);
      expect(deps.getCachedTools).toHaveBeenCalledWith({
        userId: 'tenant-user',
        serverName: 'brave',
      });
      expect(deps.getCachedTools).not.toHaveBeenCalledWith();
    });

    it('does not include a longer delimiter-overlapping server in the global slice', async () => {
      const shortServerKey = `short${Constants.mcp_delimiter}bar`;
      const longServerKey = `long${Constants.mcp_delimiter}foo_mcp_bar`;
      const globalTools: LCAvailableTools = {
        [shortServerKey]: { type: 'function', function: { name: shortServerKey } },
        [longServerKey]: { type: 'function', function: { name: longServerKey } },
      };
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(globalTools),
        getServerConfig: jest.fn().mockResolvedValue(cacheableConfig),
        getAllServerConfigs: jest.fn().mockResolvedValue({
          bar: cacheableConfig,
          foo_mcp_bar: cacheableConfig,
        }),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'bar');

      expect(result).toEqual({ [shortServerKey]: globalTools[shortServerKey] });
    });

    it('treats a missing app-shared server slice as a miss so a failed startup can recover', async () => {
      const unrelatedKey = `other${Constants.mcp_delimiter}unrelated`;
      const globalTools: LCAvailableTools = {
        [unrelatedKey]: { type: 'function', function: { name: unrelatedKey } },
      };
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(globalTools),
        getServerConfig: jest.fn().mockResolvedValue(cacheableConfig),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'brave');

      expect(result).toBeNull();
    });

    it('preserves an authoritative empty app snapshot without reconnecting', async () => {
      const unrelatedKey = `other${Constants.mcp_delimiter}unrelated`;
      const globalTools: LCAvailableTools = {
        [unrelatedKey]: { type: 'function', function: { name: unrelatedKey } },
      };
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(globalTools),
        getServerConfig: jest.fn().mockResolvedValue(cacheableConfig),
        getCachedAppServerSnapshots: jest.fn().mockResolvedValue(['brave']),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'brave');

      expect(result).toEqual({});
    });

    it('reads startup-disabled server tools from the user cache', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cachedTools),
        getServerConfig: jest.fn().mockResolvedValue(lazyConfig),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'lazy');

      expect(result).toEqual(cachedTools);
      expect(deps.getCachedTools).toHaveBeenCalledWith({ userId: 'u1', serverName: 'lazy' });
    });

    it('preserves a cached empty user catalog as an authoritative snapshot', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue({}),
        getServerConfig: jest.fn().mockResolvedValue(userScopedConfig),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'brave');

      expect(result).toEqual({});
    });

    it('heals stale raw-keyed cache entries to the normalized key format at read time', async () => {
      /** Entries written before keys embedded the normalized server name would
       *  otherwise make the server's tools vanish for up to the cache TTL —
       *  the definitions-only loader treats this map as authoritative and
       *  never reconnects on a per-key miss. */
      const staleTools: LCAvailableTools = {
        [`search${Constants.mcp_delimiter}Connector: Company`]: {
          type: 'function',
          ['function']: {
            name: `search${Constants.mcp_delimiter}Connector: Company`,
            description: 'Search',
            parameters: { type: 'object', properties: {} },
          },
        },
      };
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(staleTools),
        getServerConfig: jest.fn().mockResolvedValue(cacheableConfig),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'Connector: Company');

      const healedKey = `search${Constants.mcp_delimiter}Connector__Company`;
      expect(Object.keys(result ?? {})).toEqual([healedKey]);
      expect(result?.[healedKey]['function'].name).toBe(healedKey);
    });

    it('returns the same reference for safe server names (no heal pass)', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cachedTools),
        getServerConfig: jest.fn().mockResolvedValue(userScopedConfig),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'brave');

      expect(result).toBe(cachedTools);
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
