import { logger } from '@librechat/data-schemas';
import type * as t from '~/mcp/types';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';
import { MCPServerInspector } from '~/mcp/registry/MCPServerInspector';

// Mock MCPServerInspector to avoid actual server connections
jest.mock('~/mcp/registry/MCPServerInspector');

// Mock ServerConfigsDB to avoid mongoose dependency
jest.mock('~/mcp/registry/db/ServerConfigsDB', () => ({
  ServerConfigsDB: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(undefined),
    getAll: jest.fn().mockResolvedValue({}),
    add: jest.fn().mockImplementation(async (serverName: string, config: t.ParsedServerConfig) => ({
      serverName,
      config,
    })),
    update: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
  })),
}));

const FIXED_TIME = 1699564800000;
const originalDateNow = Date.now;
Date.now = jest.fn(() => FIXED_TIME);

// Mock mongoose for registry initialization
const mockMongoose = {} as typeof import('mongoose');

/**
 * Unit tests for MCPServersRegistry using in-memory cache.
 * For integration tests using Redis-backed cache, see MCPServersRegistry.cache_integration.spec.ts
 */
describe('MCPServersRegistry', () => {
  let registry: MCPServersRegistry;

  const testParsedConfig: t.ParsedServerConfig = {
    type: 'stdio',
    command: 'node',
    args: ['tools.js'],
    requiresOAuth: false,
    serverInstructions: 'Instructions for file_tools_server',
    tools: 'file_read, file_write',
    capabilities: '{"tools":{"listChanged":true}}',
    toolFunctions: {
      file_read_mcp_file_tools_server: {
        type: 'function',
        function: {
          name: 'file_read_mcp_file_tools_server',
          description: 'Read a file',
          parameters: { type: 'object' },
        },
      },
    },
    updatedAt: FIXED_TIME,
  };
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(FIXED_TIME));
  });
  afterAll(() => {
    Date.now = originalDateNow;
  });
  beforeEach(async () => {
    // Reset the singleton instance before each test
    (MCPServersRegistry as unknown as { instance: undefined }).instance = undefined;

    // Create a new instance for testing
    MCPServersRegistry.createInstance(mockMongoose);
    registry = MCPServersRegistry.getInstance();

    // Mock MCPServerInspector.inspect to return the config that's passed in
    jest
      .spyOn(MCPServerInspector, 'inspect')
      .mockImplementation(async (_serverName: string, rawConfig: t.MCPOptions) => {
        return {
          ...testParsedConfig,
          ...rawConfig,
          requiresOAuth: false,
        } as unknown as t.ParsedServerConfig;
      });
    await registry.reset();
  });

  // Tests for the old privateServersCache API have been removed
  // The refactoring simplified the architecture to use unified repositories (cache + DB)
  // instead of the three-tier system (sharedAppServers, sharedUserServers, privateServersCache)

  // Tests for getPrivateServerConfig have been removed
  // The new architecture uses getServerConfig() which checks cache first, then DB
  // Private server functionality is now handled by the DB repository (not yet implemented)

  describe('getAllServerConfigs', () => {
    it('should return servers from cache repository', async () => {
      // Add servers to cache using the new API
      await registry['cacheConfigsRepo'].add('app_server', testParsedConfig);
      await registry['cacheConfigsRepo'].add('user_server', testParsedConfig);

      // getAllServerConfigs should return configs from cache (DB is not implemented yet)
      const configs = await registry.getAllServerConfigs();
      expect(Object.keys(configs)).toHaveLength(2);
      expect(configs).toHaveProperty('app_server');
      expect(configs).toHaveProperty('user_server');
    });

    it('should keep YAML servers authoritative when a DB server has the same name', async () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
      const yamlConfig = { ...testParsedConfig, source: 'yaml' as const, title: 'YAML Slack' };
      const dbConfig = { ...testParsedConfig, source: 'user' as const, title: 'User Slack' };
      await registry['cacheConfigsRepo'].add('slack', yamlConfig);
      jest.spyOn(registry['dbConfigsRepo'], 'getAll').mockResolvedValue({
        slack: dbConfig,
        user_server: dbConfig,
      });

      try {
        const configs = await registry.getAllServerConfigs('user-1');

        expect(configs.slack).toMatchObject({ source: 'yaml', title: 'YAML Slack' });
        expect(configs.user_server).toMatchObject({ source: 'user', title: 'User Slack' });
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should warn when operator-managed servers shadow DB servers', async () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
      const yamlConfig = { ...testParsedConfig, source: 'yaml' as const, title: 'YAML Slack' };
      const dbConfig = { ...testParsedConfig, source: 'user' as const, title: 'User Slack' };
      await registry['cacheConfigsRepo'].add('slack', yamlConfig);
      jest.spyOn(registry['dbConfigsRepo'], 'getAll').mockResolvedValue({ slack: dbConfig });

      try {
        await registry.getAllServerConfigs('user-1');

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('slack'));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('shadow DB-backed server'));
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should preserve the user-tier entry over a config-tier override on the same name without emitting a misleading shadow warning', async () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
      const configServer = {
        ...testParsedConfig,
        source: 'config' as const,
        title: 'Config Slack',
      };
      const dbConfig = { ...testParsedConfig, source: 'user' as const, title: 'User Slack' };
      jest.spyOn(registry['dbConfigsRepo'], 'getAll').mockResolvedValue({ slack: dbConfig });

      try {
        const result = await registry.getAllServerConfigs('user-1', { slack: configServer });

        expect(result.slack.source).toBe('user');
        expect(result.slack.title).toBe('User Slack');
        expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Config MCP server'));
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('addServer', () => {
    it('should pass user source to inspector before storing DB servers', async () => {
      const inspectSpy = jest.spyOn(MCPServerInspector, 'inspect');

      await registry.addServer(
        'user_runtime_server',
        {
          type: 'streamable-http',
          url: 'https://api.example.com/mcp',
          headers: {
            'X-LibreChat-User-Email': '{{LIBRECHAT_USER_EMAIL}}',
          },
        },
        'DB',
        'user-1',
      );

      expect(inspectSpy).toHaveBeenCalledWith(
        'user_runtime_server',
        expect.objectContaining({
          source: 'user',
          headers: {
            'X-LibreChat-User-Email': '{{LIBRECHAT_USER_EMAIL}}',
          },
        }),
        undefined,
        undefined,
        undefined,
      );
    });

    it('should reserve YAML and current config server names when creating DB servers', async () => {
      await registry.addServer('slack', { ...testParsedConfig, title: 'Slack' }, 'CACHE');
      await registry['configCacheRepo'].upsert('other_tenant:hash', {
        ...testParsedConfig,
        source: 'config',
        title: 'Other Tenant Server',
      });
      const dbAddSpy = jest.spyOn(registry['dbConfigsRepo'], 'add').mockResolvedValue({
        serverName: 'slack-2',
        config: { ...testParsedConfig, source: 'user', title: 'Slack' },
      });

      await registry.addServer(
        'temp_server_name',
        { ...testParsedConfig, title: 'Slack' },
        'DB',
        'user-1',
        ['config_slack'],
      );

      const reservedServerNames = Array.from(dbAddSpy.mock.calls[0]?.[3] ?? []);
      expect(reservedServerNames).toEqual(expect.arrayContaining(['slack', 'config_slack']));
      expect(reservedServerNames).not.toContain('other_tenant');
    });
  });

  describe('reset', () => {
    it('should clear all servers from cache repository', async () => {
      // Add servers to cache using the new API
      await registry.addServer('app_server', testParsedConfig, 'CACHE');
      await registry.addServer('user_server', testParsedConfig, 'CACHE');

      // Verify servers are accessible before reset
      const appConfigBefore = await registry.getServerConfig('app_server');
      const userConfigBefore = await registry.getServerConfig('user_server');
      const allConfigsBefore = await registry.getAllServerConfigs();

      expect(appConfigBefore).toEqual(expect.objectContaining(testParsedConfig));
      expect(userConfigBefore).toEqual(expect.objectContaining(testParsedConfig));
      expect(Object.keys(allConfigsBefore)).toHaveLength(2);

      // Reset everything
      await registry.reset();

      // Verify all servers are cleared after reset
      const appConfigAfter = await registry.getServerConfig('app_server');
      const userConfigAfter = await registry.getServerConfig('user_server');
      const allConfigsAfter = await registry.getAllServerConfigs();

      expect(appConfigAfter).toBeUndefined();
      expect(userConfigAfter).toBeUndefined();
      expect(Object.keys(allConfigsAfter)).toHaveLength(0);
    });
  });

  describe('Storage location routing (getConfigRepository)', () => {
    describe('CACHE storage location', () => {
      it('should route addServer to cache repository', async () => {
        await registry.addServer('cache_server', testParsedConfig, 'CACHE');

        const config = await registry.getServerConfig('cache_server');
        expect(config).toBeDefined();
        expect(config?.type).toBe('stdio');
        if (config && 'command' in config) {
          expect(config.command).toBe('node');
        }
      });

      it('should route updateServer to cache repository', async () => {
        await registry.addServer('cache_server', testParsedConfig, 'CACHE');

        const updatedConfig = { ...testParsedConfig, command: 'python' } as t.ParsedServerConfig;
        await registry.updateServer('cache_server', updatedConfig, 'CACHE');

        const config = await registry.getServerConfig('cache_server');
        expect(config).toBeDefined();
        if (config && 'command' in config) {
          expect(config.command).toBe('python');
        }
      });

      it('should route removeServer to cache repository', async () => {
        await registry.addServer('cache_server', testParsedConfig, 'CACHE');
        // Verify server exists in underlying cache repository (not via getServerConfig to avoid populating read-through cache)
        expect(await registry['cacheConfigsRepo'].get('cache_server')).toBeDefined();

        await registry.removeServer('cache_server', 'CACHE');

        // Verify server is removed from underlying cache repository
        const config = await registry['cacheConfigsRepo'].get('cache_server');
        expect(config).toBeUndefined();
      });
    });

    describe('Invalid storage location', () => {
      it('should throw error for unsupported storage location in addServer', async () => {
        await expect(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          registry.addServer('test_server', testParsedConfig, 'INVALID' as any),
        ).rejects.toThrow('The provided storage location "INVALID" is not supported');
      });

      it('should throw error for unsupported storage location in updateServer', async () => {
        await expect(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          registry.updateServer('test_server', testParsedConfig, 'REDIS' as any),
        ).rejects.toThrow('The provided storage location "REDIS" is not supported');
      });

      it('should throw error for unsupported storage location in removeServer', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await expect(registry.removeServer('test_server', 'S3' as any)).rejects.toThrow(
          'The provided storage location "S3" is not supported',
        );
      });
    });
  });

  describe('reinspectServer', () => {
    it('should throw when called on a healthy (non-stub) server', async () => {
      await registry.addServer('healthy_server', testParsedConfig, 'CACHE');

      await expect(registry.reinspectServer('healthy_server', 'CACHE')).rejects.toThrow(
        'is not in a failed state',
      );
    });

    it('should throw when the server does not exist', async () => {
      await expect(registry.reinspectServer('ghost_server', 'CACHE')).rejects.toThrow(
        'not found in CACHE',
      );
    });
  });

  describe('Read-through cache', () => {
    describe('getServerConfig', () => {
      it('should cache repeated calls for the same server', async () => {
        // Add a server to the cache repository
        await registry['cacheConfigsRepo'].add('test_server', testParsedConfig);

        // Spy on the cache repository get method
        const cacheRepoGetSpy = jest.spyOn(registry['cacheConfigsRepo'], 'get');

        // First call should hit the cache repository
        const config1 = await registry.getServerConfig('test_server');
        expect(config1).toEqual(testParsedConfig);
        expect(cacheRepoGetSpy).toHaveBeenCalledTimes(1);

        // Second call should hit the read-through cache, not the repository
        const config2 = await registry.getServerConfig('test_server');
        expect(config2).toEqual(testParsedConfig);
        expect(cacheRepoGetSpy).toHaveBeenCalledTimes(1); // Still 1, not 2

        // Third call should also hit the read-through cache
        const config3 = await registry.getServerConfig('test_server');
        expect(config3).toEqual(testParsedConfig);
        expect(cacheRepoGetSpy).toHaveBeenCalledTimes(1); // Still 1
      });

      it('should cache "not found" results to avoid repeated DB lookups', async () => {
        // Spy on the DB repository get method
        const dbRepoGetSpy = jest.spyOn(registry['dbConfigsRepo'], 'get');

        // First call - server doesn't exist, should hit DB
        const config1 = await registry.getServerConfig('nonexistent_server');
        expect(config1).toBeUndefined();
        expect(dbRepoGetSpy).toHaveBeenCalledTimes(1);

        // Second call - should hit read-through cache, not DB
        const config2 = await registry.getServerConfig('nonexistent_server');
        expect(config2).toBeUndefined();
        expect(dbRepoGetSpy).toHaveBeenCalledTimes(1); // Still 1, not 2
      });

      it('should use different cache keys for different userIds', async () => {
        await registry['cacheConfigsRepo'].add('test_server', testParsedConfig);
        const cacheRepoGetSpy = jest.spyOn(registry['cacheConfigsRepo'], 'get');

        await registry.getServerConfig('test_server');
        expect(cacheRepoGetSpy).toHaveBeenCalledTimes(1);

        await registry.getServerConfig('test_server', 'user123');
        expect(cacheRepoGetSpy).toHaveBeenCalledTimes(2);

        await registry.getServerConfig('test_server', 'user123');
        expect(cacheRepoGetSpy).toHaveBeenCalledTimes(2);

        await registry.getServerConfig('test_server', 'user456');
        expect(cacheRepoGetSpy).toHaveBeenCalledTimes(3);
      });
    });

    describe('getAllServerConfigs', () => {
      it('should cache repeated calls', async () => {
        // Add servers to cache
        await registry['cacheConfigsRepo'].add('server1', testParsedConfig);
        await registry['cacheConfigsRepo'].add('server2', testParsedConfig);

        // Spy on the cache repository getAll method
        const cacheRepoGetAllSpy = jest.spyOn(registry['cacheConfigsRepo'], 'getAll');

        // First call should hit the repository
        const configs1 = await registry.getAllServerConfigs();
        expect(Object.keys(configs1)).toHaveLength(2);
        expect(cacheRepoGetAllSpy).toHaveBeenCalledTimes(1);

        // Second call should hit the read-through cache
        const configs2 = await registry.getAllServerConfigs();
        expect(Object.keys(configs2)).toHaveLength(2);
        expect(cacheRepoGetAllSpy).toHaveBeenCalledTimes(1); // Still 1

        // Third call should also hit the read-through cache
        const configs3 = await registry.getAllServerConfigs();
        expect(Object.keys(configs3)).toHaveLength(2);
        expect(cacheRepoGetAllSpy).toHaveBeenCalledTimes(1); // Still 1
      });

      it('should use different cache keys for different userIds', async () => {
        // Spy on the cache repository getAll method
        const cacheRepoGetAllSpy = jest.spyOn(registry['cacheConfigsRepo'], 'getAll');

        // First call without userId
        await registry.getAllServerConfigs();
        expect(cacheRepoGetAllSpy).toHaveBeenCalledTimes(1);

        // Call with userId - should be a different cache key
        await registry.getAllServerConfigs('user123');
        expect(cacheRepoGetAllSpy).toHaveBeenCalledTimes(2);

        // Repeat call with same userId - should hit read-through cache
        await registry.getAllServerConfigs('user123');
        expect(cacheRepoGetAllSpy).toHaveBeenCalledTimes(2); // Still 2

        // Call with different userId - should hit repository
        await registry.getAllServerConfigs('user456');
        expect(cacheRepoGetAllSpy).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('admin-panel overrides for YAML-defined servers', () => {
    const yamlLangfuseConfig = Object.freeze({
      type: 'streamable-http',
      url: 'https://langfuse.com/api/public/mcp',
      requiresOAuth: false,
      source: 'yaml',
      updatedAt: FIXED_TIME,
    }) as t.ParsedServerConfig;

    it('flows config-tier override on a YAML-defined server through to getAllServerConfigs', async () => {
      await registry['cacheConfigsRepo'].add('langfuse-docs', yamlLangfuseConfig);

      const overrideRawConfig: t.MCPOptions = {
        type: 'streamable-http',
        url: 'https://langfuse.com/api/public/mcp',
        requiresOAuth: false,
        iconPath: 'https://example.com/icon.svg',
      };

      const configServers = await registry.ensureConfigServers({
        'langfuse-docs': overrideRawConfig,
      });

      expect(configServers['langfuse-docs']).toBeDefined();
      expect(configServers['langfuse-docs'].iconPath).toBe('https://example.com/icon.svg');

      const result = await registry.getAllServerConfigs('user-1', configServers);

      expect(result['langfuse-docs']).toBeDefined();
      expect(result['langfuse-docs'].iconPath).toBe('https://example.com/icon.svg');
      expect(result['langfuse-docs'].source).toBe('yaml');
    });

    it('preserves user-DB tier (source: "user") over config-tier overrides', async () => {
      const userDbEntry: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://user-defined.example.com/mcp',
        requiresOAuth: false,
        source: 'user',
        dbId: 'user-db-id-123',
        updatedAt: FIXED_TIME,
      };

      jest
        .spyOn(registry['dbConfigsRepo'], 'getAll')
        .mockResolvedValue({ 'shared-server': userDbEntry });

      const configTierOverride: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://admin-override.example.com/mcp',
        requiresOAuth: false,
        source: 'config',
        iconPath: 'https://example.com/admin-icon.svg',
        updatedAt: FIXED_TIME,
      };

      const result = await registry.getAllServerConfigs('user-1', {
        'shared-server': configTierOverride,
      });

      expect(result['shared-server']).toBeDefined();
      expect(result['shared-server'].source).toBe('user');
      expect(result['shared-server'].url).toBe('https://user-defined.example.com/mcp');
      expect(result['shared-server'].dbId).toBe('user-db-id-123');
    });

    it('still runs lazy-init for pure config-tier servers not present in YAML', async () => {
      const configOnlyRawConfig: t.MCPOptions = {
        type: 'streamable-http',
        url: 'https://config-only.example.com/mcp',
        requiresOAuth: false,
        iconPath: 'https://example.com/config-only-icon.svg',
      };

      const inspectSpy = jest.spyOn(MCPServerInspector, 'inspect');
      inspectSpy.mockClear();

      const result = await registry.ensureConfigServers({
        'config-only-server': configOnlyRawConfig,
      });

      expect(inspectSpy).toHaveBeenCalledTimes(1);
      expect(inspectSpy).toHaveBeenCalledWith(
        'config-only-server',
        {
          ...configOnlyRawConfig,
          source: 'config',
        },
        undefined,
        undefined,
        undefined,
      );
      expect(result['config-only-server']).toBeDefined();
      expect(result['config-only-server'].iconPath).toBe(
        'https://example.com/config-only-icon.svg',
      );
      expect(result['config-only-server'].source).toBe('config');
    });

    it('preserves YAML base entry when config-tier override reports inspectionFailed', async () => {
      const yamlSeed: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://langfuse.com/api/public/mcp',
        requiresOAuth: false,
        headers: { Authorization: 'Bearer yaml-token' },
        source: 'yaml',
        tools: 'yaml_tool_a, yaml_tool_b',
        capabilities: '{"tools":{"listChanged":true}}',
        updatedAt: FIXED_TIME,
      };
      await registry['cacheConfigsRepo'].add('langfuse-docs', yamlSeed);

      const failedOverride: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://langfuse.com/api/public/mcp',
        requiresOAuth: false,
        source: 'config',
        inspectionFailed: true,
        updatedAt: FIXED_TIME,
      };

      const result = await registry.getAllServerConfigs('user-1', {
        'langfuse-docs': failedOverride,
      });

      expect(result['langfuse-docs']).toBeDefined();
      expect(result['langfuse-docs'].source).toBe('yaml');
      expect(result['langfuse-docs'].inspectionFailed).toBeUndefined();
      expect(result['langfuse-docs'].tools).toBe('yaml_tool_a, yaml_tool_b');
      expect(result['langfuse-docs'].capabilities).toBe('{"tools":{"listChanged":true}}');
      expect((result['langfuse-docs'] as t.StreamableHTTPOptions).headers).toEqual({
        Authorization: 'Bearer yaml-token',
      });
    });

    it('healthy YAML entry survives end-to-end when inspect throws for YAML server', async () => {
      await registry['cacheConfigsRepo'].add('langfuse-docs', yamlLangfuseConfig);
      const inspectSpy = jest.spyOn(MCPServerInspector, 'inspect');
      inspectSpy.mockClear();
      inspectSpy.mockRejectedValueOnce(new Error('network timeout'));

      const configServers = await registry.ensureConfigServers({
        'langfuse-docs': {
          type: 'streamable-http',
          url: 'https://langfuse.com/api/public/mcp',
          iconPath: 'https://example.com/icon.svg',
        } as t.MCPOptions,
      });
      const result = await registry.getAllServerConfigs('user-1', configServers);

      expect(result['langfuse-docs'].source).toBe('yaml');
      expect(result['langfuse-docs'].inspectionFailed).toBeUndefined();
      expect(result['langfuse-docs'].url).toBe('https://langfuse.com/api/public/mcp');
    });

    it('preserves YAML source tag when config-tier override succeeds', async () => {
      const yamlSeed: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://langfuse.com/api/public/mcp',
        requiresOAuth: false,
        source: 'yaml',
        updatedAt: FIXED_TIME,
      };
      await registry['cacheConfigsRepo'].add('langfuse-docs', yamlSeed);

      const successfulOverride: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://langfuse.com/api/public/mcp',
        requiresOAuth: false,
        source: 'config',
        iconPath: 'https://example.com/icon.svg',
        updatedAt: FIXED_TIME,
      };

      const result = await registry.getAllServerConfigs('user-1', {
        'langfuse-docs': successfulOverride,
      });

      expect(result['langfuse-docs']).toBeDefined();
      expect(result['langfuse-docs'].source).toBe('yaml');
      expect(result['langfuse-docs'].iconPath).toBe('https://example.com/icon.svg');
    });

    it('skips lazy-init for YAML server with no admin override', async () => {
      const yamlSeed: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://langfuse.com/api/public/mcp',
        requiresOAuth: false,
        source: 'yaml',
        updatedAt: FIXED_TIME,
      };
      await registry['cacheConfigsRepo'].add('langfuse-docs', yamlSeed);

      const yamlRawConfig: t.MCPOptions = {
        type: 'streamable-http',
        url: 'https://langfuse.com/api/public/mcp',
        requiresOAuth: false,
      };

      const inspectSpy = jest.spyOn(MCPServerInspector, 'inspect');
      inspectSpy.mockClear();

      const result = await registry.ensureConfigServers({
        'langfuse-docs': yamlRawConfig,
      });

      expect(inspectSpy).not.toHaveBeenCalled();
      expect(result['langfuse-docs']).toBeUndefined();
    });

    it('runs lazy-init for YAML server with admin override', async () => {
      const yamlSeed: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://langfuse.com/api/public/mcp',
        requiresOAuth: false,
        source: 'yaml',
        updatedAt: FIXED_TIME,
      };
      await registry['cacheConfigsRepo'].add('langfuse-docs', yamlSeed);

      const overrideRawConfig: t.MCPOptions = {
        type: 'streamable-http',
        url: 'https://langfuse.com/api/public/mcp',
        requiresOAuth: false,
        iconPath: 'https://x.com/icon.svg',
      };

      const inspectSpy = jest.spyOn(MCPServerInspector, 'inspect');
      inspectSpy.mockClear();

      await registry.ensureConfigServers({
        'langfuse-docs': overrideRawConfig,
      });

      expect(inspectSpy).toHaveBeenCalledTimes(1);
    });

    it('getServerConfig falls through to YAML on failure stub', async () => {
      const yamlSeed: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://langfuse.com/api/public/mcp',
        requiresOAuth: false,
        source: 'yaml',
        tools: 'yaml_tool_a',
        updatedAt: FIXED_TIME,
      };
      await registry['cacheConfigsRepo'].add('langfuse-docs', yamlSeed);

      const failureStub: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://langfuse.com/api/public/mcp',
        requiresOAuth: false,
        source: 'config',
        inspectionFailed: true,
        updatedAt: FIXED_TIME,
      };

      const result = await registry.getServerConfig('langfuse-docs', 'user-1', {
        'langfuse-docs': failureStub,
      });

      expect(result).toBeDefined();
      expect(result?.source).toBe('yaml');
      expect(result?.inspectionFailed).toBeUndefined();
      expect(result?.tools).toBe('yaml_tool_a');
    });

    it('passes a fully merged config to lazy-init when override only adds new fields', async () => {
      const yamlSeed: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://langfuse.com/api/public/mcp',
        requiresOAuth: false,
        headers: { Authorization: 'Bearer yaml-token' },
        source: 'yaml',
        updatedAt: FIXED_TIME,
      };
      await registry['cacheConfigsRepo'].add('langfuse-docs', yamlSeed);

      const mergedRawConfig: t.MCPOptions = {
        type: 'streamable-http',
        url: 'https://langfuse.com/api/public/mcp',
        requiresOAuth: false,
        headers: { Authorization: 'Bearer yaml-token' },
        iconPath: 'https://example.com/icon.svg',
      };

      const inspectSpy = jest.spyOn(MCPServerInspector, 'inspect');
      inspectSpy.mockClear();

      const result = await registry.ensureConfigServers({
        'langfuse-docs': mergedRawConfig,
      });

      expect(inspectSpy).toHaveBeenCalledTimes(1);
      const firstCallArgs = inspectSpy.mock.calls[0];
      expect(firstCallArgs[0]).toBe('langfuse-docs');
      const passedConfig = firstCallArgs[1] as t.StreamableHTTPOptions & {
        iconPath?: string;
        requiresOAuth?: boolean;
      };
      expect(passedConfig.type).toBe('streamable-http');
      expect(passedConfig.url).toBe('https://langfuse.com/api/public/mcp');
      expect(passedConfig.requiresOAuth).toBe(false);
      expect(passedConfig.headers).toEqual({ Authorization: 'Bearer yaml-token' });
      expect(passedConfig.iconPath).toBe('https://example.com/icon.svg');

      expect(result['langfuse-docs']).toBeDefined();
      expect(result['langfuse-docs'].iconPath).toBe('https://example.com/icon.svg');
    });
  });
});
