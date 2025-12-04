import * as t from '~/mcp/types';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';
import { MCPServerInspector } from '~/mcp/registry/MCPServerInspector';

// Mock MCPServerInspector to avoid actual server connections
jest.mock('~/mcp/registry/MCPServerInspector');

// Mock ServerConfigsDB to avoid mongoose dependency
jest.mock('~/mcp/registry/db/ServerConfigsDB', () => ({
  ServerConfigsDB: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(undefined),
    getAll: jest.fn().mockResolvedValue({}),
    add: jest.fn().mockResolvedValue(undefined),
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

      expect(appConfigBefore).toEqual(testParsedConfig);
      expect(userConfigBefore).toEqual(testParsedConfig);
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
        expect(await registry.getServerConfig('cache_server')).toBeDefined();

        await registry.removeServer('cache_server', 'CACHE');

        const config = await registry.getServerConfig('cache_server');
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
});
