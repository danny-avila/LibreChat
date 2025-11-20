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
    cachedAt: FIXED_TIME,
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

  describe('private user servers', () => {
    it('should add and remove private user server', async () => {
      const userId = 'user123';
      const serverName = 'private_server';

      // Add private user server
      await registry.addPrivateUserServer(userId, serverName, testParsedConfig);

      // Verify server was added
      const retrievedConfig = await registry.getServerConfig(serverName, userId);
      expect(retrievedConfig).toEqual(testParsedConfig);

      // Remove private user server
      await registry.removePrivateUserServer(userId, serverName);

      // Verify server was removed
      const configAfterRemoval = await registry.getServerConfig(serverName, userId);
      expect(configAfterRemoval).toBeUndefined();
    });

    it('should throw error when adding duplicate private user server', async () => {
      const userId = 'user123';
      const serverName = 'private_server';

      await registry.addPrivateUserServer(userId, serverName, testParsedConfig);
      await expect(
        registry.addPrivateUserServer(userId, serverName, testParsedConfig),
      ).rejects.toThrow(
        'Server "private_server" already exists in cache. Use update() to modify existing configs.',
      );
    });

    it('should update an existing private user server', async () => {
      const userId = 'user123';
      const serverName = 'private_server';
      const updatedConfig: t.ParsedServerConfig = {
        type: 'stdio',
        command: 'python',
        args: ['updated.py'],
        requiresOAuth: true,
        cachedAt: FIXED_TIME,
      };

      // Add private user server
      await registry.addPrivateUserServer(userId, serverName, testParsedConfig);

      // Update the server config
      await registry.updatePrivateUserServer(userId, serverName, updatedConfig);

      // Verify server was updated
      const retrievedConfig = await registry.getServerConfig(serverName, userId);
      expect(retrievedConfig).toEqual(updatedConfig);
    });

    it('should throw error when updating non-existent server', async () => {
      const userId = 'user123';
      const serverName = 'private_server';

      // Add a user cache first
      await registry.addPrivateUserServer(userId, 'other_server', testParsedConfig);

      await expect(
        registry.updatePrivateUserServer(userId, serverName, testParsedConfig),
      ).rejects.toThrow(
        'Server "private_server" does not exist in cache. Use add() to create new configs.',
      );
    });

    it('should throw error when updating non-existent server (lazy-loads cache)', async () => {
      const userId = 'nonexistent_user';
      const serverName = 'private_server';

      // With lazy-loading, cache is created but server doesn't exist in it
      await expect(
        registry.updatePrivateUserServer(userId, serverName, testParsedConfig),
      ).rejects.toThrow(
        'Server "private_server" does not exist in cache. Use add() to create new configs.',
      );
    });
  });

  describe('getPrivateServerConfig', () => {
    it('should retrieve private server config for a specific user', async () => {
      const userId = 'user123';
      const serverName = 'private_server';

      await registry.addPrivateUserServer(userId, serverName, testParsedConfig);

      const retrievedConfig = await registry.getPrivateServerConfig(serverName, userId);
      expect(retrievedConfig).toEqual(testParsedConfig);
    });

    it('should return undefined if server does not exist in user private cache', async () => {
      const userId = 'user123';

      // Create a cache for this user with a different server
      await registry.addPrivateUserServer(userId, 'other_server', testParsedConfig);

      // Try to get a server that doesn't exist
      const retrievedConfig = await registry.getPrivateServerConfig('nonexistent_server', userId);
      expect(retrievedConfig).toBeUndefined();
    });

    it('should throw error when userId is empty string', async () => {
      await expect(registry.getPrivateServerConfig('server_name', '')).rejects.toThrow(
        'userId is required for getPrivateServerConfig',
      );
    });

    it('should return undefined when user has no private servers (lazy-loads cache)', async () => {
      const userId = 'user_with_no_cache';

      // With lazy-loading, cache is created but is empty
      const config = await registry.getPrivateServerConfig('server_name', userId);
      expect(config).toBeUndefined();
    });

    it('should isolate private servers between different users', async () => {
      const user1 = 'user1';
      const user2 = 'user2';
      const serverName = 'shared_name_server';

      const config1: t.ParsedServerConfig = {
        ...testParsedConfig,
        args: ['user1.js'],
      };
      const config2: t.ParsedServerConfig = {
        ...testParsedConfig,
        args: ['user2.js'],
      };

      await registry.addPrivateUserServer(user1, serverName, config1);
      await registry.addPrivateUserServer(user2, serverName, config2);

      const user1Config = await registry.getPrivateServerConfig(serverName, user1);
      const user2Config = await registry.getPrivateServerConfig(serverName, user2);

      // Verify each user gets their own config
      expect(user1Config).toBeDefined();
      expect(user2Config).toBeDefined();
      if (user1Config && 'args' in user1Config) {
        expect(user1Config.args).toEqual(['user1.js']);
      }
      if (user2Config && 'args' in user2Config) {
        expect(user2Config.args).toEqual(['user2.js']);
      }
    });

    it('should not retrieve shared servers through getPrivateServerConfig', async () => {
      const userId = 'user123';

      // Add servers to shared caches
      await registry.sharedAppServers.add('app_server', testParsedConfig);
      await registry.sharedUserServers.add('user_server', testParsedConfig);

      // Create a private cache for the user (but don't add these servers to it)
      await registry.addPrivateUserServer(userId, 'private_server', testParsedConfig);

      // Try to get shared servers using getPrivateServerConfig - should return undefined
      // because getPrivateServerConfig only looks at private cache, not shared caches
      const appServerConfig = await registry.getPrivateServerConfig('app_server', userId);
      const userServerConfig = await registry.getPrivateServerConfig('user_server', userId);

      expect(appServerConfig).toBeUndefined();
      expect(userServerConfig).toBeUndefined();
    });
  });

  describe('getAllServerConfigs', () => {
    it('should return correct servers based on userId', async () => {
      // Add servers to all three caches
      await registry.sharedAppServers.add('app_server', testParsedConfig);
      await registry.sharedUserServers.add('user_server', testParsedConfig);
      await registry.addPrivateUserServer('abc', 'abc_private_server', testParsedConfig);
      await registry.addPrivateUserServer('xyz', 'xyz_private_server', testParsedConfig);

      // Without userId: should return only shared app + shared user servers
      const configsNoUser = await registry.getAllServerConfigs();
      expect(Object.keys(configsNoUser)).toHaveLength(2);
      expect(configsNoUser).toHaveProperty('app_server');
      expect(configsNoUser).toHaveProperty('user_server');

      // With userId 'abc': should return shared app + shared user + abc's private servers
      const configsAbc = await registry.getAllServerConfigs('abc');
      expect(Object.keys(configsAbc)).toHaveLength(3);
      expect(configsAbc).toHaveProperty('app_server');
      expect(configsAbc).toHaveProperty('user_server');
      expect(configsAbc).toHaveProperty('abc_private_server');

      // With userId 'xyz': should return shared app + shared user + xyz's private servers
      const configsXyz = await registry.getAllServerConfigs('xyz');
      expect(Object.keys(configsXyz)).toHaveLength(3);
      expect(configsXyz).toHaveProperty('app_server');
      expect(configsXyz).toHaveProperty('user_server');
      expect(configsXyz).toHaveProperty('xyz_private_server');
    });
  });

  describe('reset', () => {
    it('should clear all servers from all caches (shared app, shared user, and private user)', async () => {
      const userId = 'user123';

      // Add servers to all three caches
      await registry.sharedAppServers.add('app_server', testParsedConfig);
      await registry.sharedUserServers.add('user_server', testParsedConfig);
      await registry.addPrivateUserServer(userId, 'private_server', testParsedConfig);

      // Verify all servers are accessible before reset
      const appConfigBefore = await registry.getServerConfig('app_server');
      const userConfigBefore = await registry.getServerConfig('user_server');
      const privateConfigBefore = await registry.getServerConfig('private_server', userId);
      const allConfigsBefore = await registry.getAllServerConfigs(userId);

      expect(appConfigBefore).toEqual(testParsedConfig);
      expect(userConfigBefore).toEqual(testParsedConfig);
      expect(privateConfigBefore).toEqual(testParsedConfig);
      expect(Object.keys(allConfigsBefore)).toHaveLength(3);

      // Reset everything
      await registry.reset();

      // Verify all servers are cleared after reset
      const appConfigAfter = await registry.getServerConfig('app_server');
      const userConfigAfter = await registry.getServerConfig('user_server');
      const privateConfigAfter = await registry.getServerConfig('private_server', userId);
      const allConfigsAfter = await registry.getAllServerConfigs(userId);

      expect(appConfigAfter).toBeUndefined();
      expect(userConfigAfter).toBeUndefined();
      expect(privateConfigAfter).toBeUndefined();
      expect(Object.keys(allConfigsAfter)).toHaveLength(0);
    });
  });
});
