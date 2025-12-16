import * as t from '~/mcp/types';
import { mcpServersRegistry as registry } from '~/mcp/registry/MCPServersRegistry';

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
  };

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

    it('should throw error when updating server for non-existent user', async () => {
      const userId = 'nonexistent_user';
      const serverName = 'private_server';

      await expect(
        registry.updatePrivateUserServer(userId, serverName, testParsedConfig),
      ).rejects.toThrow('No private servers found for user "nonexistent_user".');
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
