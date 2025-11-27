import * as t from '~/mcp/types';
import { mcpServersRegistry as registry } from '~/mcp/registry/MCPServersRegistry';
const FIXED_TIME = 1699564800000;
const originalDateNow = Date.now;
Date.now = jest.fn(() => FIXED_TIME);
/**
 * Unit tests for MCPServersRegistry using in-memory cache.
 * For integration tests using Redis-backed cache, see MCPServersRegistry.cache_integration.spec.ts
 */
describe('MCPServersRegistry', () => {
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
    lastUpdatedAt: FIXED_TIME,
  };
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(FIXED_TIME));
  });
  afterAll(() => {
    Date.now = originalDateNow;
  });
  beforeEach(async () => {
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
      await registry.cacheConfigsRepo.add('app_server', testParsedConfig);
      await registry.cacheConfigsRepo.add('user_server', testParsedConfig);

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
      await registry.cacheConfigsRepo.add('app_server', testParsedConfig);
      await registry.cacheConfigsRepo.add('user_server', testParsedConfig);

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
});
