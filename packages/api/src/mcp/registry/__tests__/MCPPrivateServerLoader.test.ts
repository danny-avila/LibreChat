import { mcpServersRegistry as registry } from '../MCPServersRegistry';
import { privateServersLoadStatusCache as loadStatusCache } from '../cache/PrivateServersLoadStatusCache';
import { MCPPrivateServerLoader } from '../MCPPrivateServerLoader';
import { logger } from '@librechat/data-schemas';
import type * as t from '~/mcp/types';
import type { MCPServerDB } from 'librechat-data-provider';

// Mock dependencies
jest.mock('../MCPServersRegistry', () => ({
  mcpServersRegistry: {
    privateServersCache: {
      get: jest.fn(),
      add: jest.fn(),
      reset: jest.fn(),
      updateServerConfigIfExists: jest.fn(),
      findUsersWithServer: jest.fn(),
      removeServerConfigIfCacheExists: jest.fn(),
      addServerConfigIfCacheExists: jest.fn(),
    },
    getServerConfig: jest.fn(),
    addSharedServer: jest.fn(),
    removeServer: jest.fn(),
  },
}));

jest.mock('../cache/PrivateServersLoadStatusCache', () => ({
  privateServersLoadStatusCache: {
    isLoaded: jest.fn(),
    setLoaded: jest.fn(),
    acquireLoadLock: jest.fn(),
    releaseLoadLock: jest.fn(),
    waitForLoad: jest.fn(),
  },
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('MCPPrivateServerLoader', () => {
  const mockConfig1: t.ParsedServerConfig = {
    command: 'node',
    args: ['server1.js'],
    env: { TEST: 'value1' },
    lastUpdatedAt: Date.now(),
  };

  const mockConfig2: t.ParsedServerConfig = {
    command: 'python',
    args: ['server2.py'],
    env: { TEST: 'value2' },
    lastUpdatedAt: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadPrivateServers()', () => {
    it('should validate userId and throw error if empty', async () => {
      const configsLoader = jest.fn();

      await expect(MCPPrivateServerLoader.loadPrivateServers('', configsLoader)).rejects.toThrow(
        'userId is required and cannot be empty',
      );

      await expect(MCPPrivateServerLoader.loadPrivateServers('   ', configsLoader)).rejects.toThrow(
        'userId is required and cannot be empty',
      );
    });

    it('should validate configsLoader and throw error if not a function', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(MCPPrivateServerLoader.loadPrivateServers('user1', null as any)).rejects.toThrow(
        'configsLoader must be a function',
      );

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        MCPPrivateServerLoader.loadPrivateServers('user1', 'not-a-function' as any),
      ).rejects.toThrow('configsLoader must be a function');
    });

    it('should skip loading if user servers are already loaded', async () => {
      const configsLoader = jest.fn();
      (loadStatusCache.isLoaded as jest.Mock).mockResolvedValue(true);

      await MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader);

      expect(loadStatusCache.isLoaded).toHaveBeenCalledWith('user1');
      expect(configsLoader).not.toHaveBeenCalled();
      expect(loadStatusCache.acquireLoadLock).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        '[MCP][PrivateServerLoader] User user1 private servers already loaded',
      );
    });

    it('should load private servers for a user successfully', async () => {
      const mockConfigs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
        {
          _id: 'mock-id-2',
          mcp_id: 'server2',
          config: mockConfig2,
        },
      ];

      const configsLoader = jest.fn().mockResolvedValue(mockConfigs);
      (loadStatusCache.isLoaded as jest.Mock).mockResolvedValue(false);
      (loadStatusCache.acquireLoadLock as jest.Mock).mockResolvedValue(true);
      (registry.privateServersCache.get as jest.Mock).mockResolvedValue(undefined);

      await MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader);

      expect(loadStatusCache.acquireLoadLock).toHaveBeenCalledWith('user1');
      expect(configsLoader).toHaveBeenCalledWith('user1');
      expect(registry.privateServersCache.add).toHaveBeenCalledWith('user1', 'server1', {
        ...mockConfig1,
        dbId: 'mock-id-1',
      });
      expect(registry.privateServersCache.add).toHaveBeenCalledWith('user1', 'server2', {
        ...mockConfig2,
        dbId: 'mock-id-2',
      });
      expect(loadStatusCache.setLoaded).toHaveBeenCalledWith('user1', 3600_000);
      expect(loadStatusCache.releaseLoadLock).toHaveBeenCalledWith('user1');
      expect(logger.info).toHaveBeenCalledWith(
        '[MCP][PrivateServerLoader] Loading private servers for user user1',
      );
    });

    it('should skip servers that already exist in cache', async () => {
      const mockConfigs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
        {
          _id: 'mock-id-2',
          mcp_id: 'server2',
          config: mockConfig2,
        },
      ];

      const configsLoader = jest.fn().mockResolvedValue(mockConfigs);
      (loadStatusCache.isLoaded as jest.Mock).mockResolvedValue(false);
      (loadStatusCache.acquireLoadLock as jest.Mock).mockResolvedValue(true);
      (registry.privateServersCache.get as jest.Mock)
        .mockResolvedValueOnce(mockConfig1) // server1 exists
        .mockResolvedValueOnce(undefined); // server2 doesn't exist

      await MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader);

      expect(registry.privateServersCache.add).toHaveBeenCalledTimes(1);
      expect(registry.privateServersCache.add).toHaveBeenCalledWith('user1', 'server2', {
        ...mockConfig2,
        dbId: 'mock-id-2',
      });
      expect(loadStatusCache.setLoaded).toHaveBeenCalledWith('user1', 3600_000);
      expect(loadStatusCache.releaseLoadLock).toHaveBeenCalledWith('user1');
      expect(logger.debug).toHaveBeenCalledWith(
        '[MCP][PrivateServer][server1] Private server already exists for user user1',
      );
    });

    it('should throw error if configsLoader fails', async () => {
      const configsLoader = jest.fn().mockRejectedValue(new Error('DB connection failed'));
      (loadStatusCache.isLoaded as jest.Mock).mockResolvedValue(false);
      (loadStatusCache.acquireLoadLock as jest.Mock).mockResolvedValue(true);

      await expect(
        MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader),
      ).rejects.toThrow('DB connection failed');

      expect(logger.error).toHaveBeenCalledWith(
        '[MCP][PrivateServerLoader] Loading private servers for user user1 failed.',
        expect.any(Error),
      );
      expect(loadStatusCache.setLoaded).not.toHaveBeenCalled();
      expect(loadStatusCache.releaseLoadLock).toHaveBeenCalledWith('user1');
    });

    it('should throw error if cache.add fails', async () => {
      const mockConfigs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
      ];

      const configsLoader = jest.fn().mockResolvedValue(mockConfigs);
      (loadStatusCache.isLoaded as jest.Mock).mockResolvedValue(false);
      (loadStatusCache.acquireLoadLock as jest.Mock).mockResolvedValue(true);
      (registry.privateServersCache.get as jest.Mock).mockResolvedValue(undefined);
      (registry.privateServersCache.add as jest.Mock).mockRejectedValue(
        new Error('Cache write failed'),
      );

      await expect(
        MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader),
      ).rejects.toThrow('Cache write failed');
      expect(loadStatusCache.setLoaded).not.toHaveBeenCalled();
      expect(loadStatusCache.releaseLoadLock).toHaveBeenCalledWith('user1');
    });

    it('should handle empty configs gracefully', async () => {
      const mockConfigs: MCPServerDB[] = [];

      const configsLoader = jest.fn().mockResolvedValue(mockConfigs);
      (loadStatusCache.isLoaded as jest.Mock).mockResolvedValue(false);
      (loadStatusCache.acquireLoadLock as jest.Mock).mockResolvedValue(true);

      await MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader);

      expect(registry.privateServersCache.add).not.toHaveBeenCalled();
      expect(loadStatusCache.setLoaded).toHaveBeenCalledWith('user1', 3600_000);
      expect(loadStatusCache.releaseLoadLock).toHaveBeenCalledWith('user1');
    });

    it('should prevent partial loads after crash - loaded flag not set on failure', async () => {
      const mockConfigs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
        {
          _id: 'mock-id-2',
          mcp_id: 'server2',
          config: mockConfig2,
        },
      ];

      const configsLoader = jest.fn().mockResolvedValue(mockConfigs);
      (loadStatusCache.isLoaded as jest.Mock).mockResolvedValue(false);
      (loadStatusCache.acquireLoadLock as jest.Mock).mockResolvedValue(true);
      (registry.privateServersCache.get as jest.Mock).mockResolvedValue(undefined);

      // Simulate crash after loading first server
      (registry.privateServersCache.add as jest.Mock)
        .mockResolvedValueOnce(undefined) // server1 succeeds
        .mockRejectedValueOnce(new Error('Process crashed')); // server2 fails

      await expect(
        MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader),
      ).rejects.toThrow('Process crashed');

      // Loaded flag should NOT be set
      expect(loadStatusCache.setLoaded).not.toHaveBeenCalled();
      // Lock should be released even on error
      expect(loadStatusCache.releaseLoadLock).toHaveBeenCalledWith('user1');

      // On next call, should retry full load
      jest.clearAllMocks();
      (loadStatusCache.isLoaded as jest.Mock).mockResolvedValue(false);
      (loadStatusCache.acquireLoadLock as jest.Mock).mockResolvedValue(true);
      (registry.privateServersCache.add as jest.Mock).mockResolvedValue(undefined);
      await MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader);

      // Now flag should be set
      expect(loadStatusCache.setLoaded).toHaveBeenCalledWith('user1', 3600_000);
    });

    it('should wait for another process when lock is already held', async () => {
      const configsLoader = jest.fn();
      (loadStatusCache.isLoaded as jest.Mock).mockResolvedValue(false);
      (loadStatusCache.acquireLoadLock as jest.Mock).mockResolvedValue(false); // Lock held
      (loadStatusCache.waitForLoad as jest.Mock).mockResolvedValue(true); // Wait completes

      await MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader);

      expect(loadStatusCache.acquireLoadLock).toHaveBeenCalledWith('user1');
      expect(loadStatusCache.waitForLoad).toHaveBeenCalledWith('user1');
      expect(configsLoader).not.toHaveBeenCalled(); // Didn't load, waited instead
      expect(logger.debug).toHaveBeenCalledWith(
        '[MCP][PrivateServerLoader] Another process is loading user user1, waiting...',
      );
      expect(logger.debug).toHaveBeenCalledWith(
        '[MCP][PrivateServerLoader] User user1 loaded by another process',
      );
    });

    it('should retry lock acquisition after wait timeout', async () => {
      const mockConfigs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
      ];

      const configsLoader = jest.fn().mockResolvedValue(mockConfigs);
      (loadStatusCache.isLoaded as jest.Mock).mockResolvedValue(false);
      (loadStatusCache.acquireLoadLock as jest.Mock)
        .mockResolvedValueOnce(false) // First attempt: lock held
        .mockResolvedValueOnce(true); // Retry after timeout: success
      (loadStatusCache.waitForLoad as jest.Mock).mockResolvedValue(false); // Wait times out
      (registry.privateServersCache.get as jest.Mock).mockResolvedValue(undefined);

      await MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader);

      expect(loadStatusCache.acquireLoadLock).toHaveBeenCalledTimes(2);
      expect(loadStatusCache.waitForLoad).toHaveBeenCalledWith('user1');
      expect(configsLoader).toHaveBeenCalled(); // Loaded after retry
      expect(logger.warn).toHaveBeenCalledWith(
        '[MCP][PrivateServerLoader] Timeout waiting for user user1, retrying lock acquisition',
      );
    });

    it('should throw error if retry lock acquisition fails', async () => {
      const configsLoader = jest.fn();
      (loadStatusCache.isLoaded as jest.Mock).mockResolvedValue(false);
      (loadStatusCache.acquireLoadLock as jest.Mock).mockResolvedValue(false); // Both attempts fail
      (loadStatusCache.waitForLoad as jest.Mock).mockResolvedValue(false); // Wait times out

      await expect(
        MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader),
      ).rejects.toThrow('Failed to acquire load lock for user user1');

      expect(loadStatusCache.acquireLoadLock).toHaveBeenCalledTimes(2);
      expect(configsLoader).not.toHaveBeenCalled();
    });
  });

  describe('updatePrivateServer()', () => {
    it('should propagate metadata update to all users when server is not promoted', async () => {
      (registry.getServerConfig as jest.Mock).mockResolvedValue(undefined);

      await MCPPrivateServerLoader.updatePrivateServer('server1', mockConfig2);

      expect(registry.getServerConfig).toHaveBeenCalledWith('server1');
      expect(registry.privateServersCache.updateServerConfigIfExists).toHaveBeenCalledWith(
        'server1',
        mockConfig2,
      );
      expect(registry.removeServer).not.toHaveBeenCalled();
      expect(registry.addSharedServer).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        '[MCP][PrivateServer][server1] Propagating metadata update to all users',
      );
    });

    it('should handle promoted server by updating shared registry', async () => {
      const sharedConfig: t.ParsedServerConfig = {
        command: 'node',
        args: ['shared.js'],
        env: { SHARED: 'true' },
        lastUpdatedAt: Date.now(),
      };

      (registry.getServerConfig as jest.Mock).mockResolvedValue(sharedConfig);

      await MCPPrivateServerLoader.updatePrivateServer('server1', mockConfig2);

      expect(registry.getServerConfig).toHaveBeenCalledWith('server1');
      expect(registry.removeServer).toHaveBeenCalledWith('server1');
      expect(registry.addSharedServer).toHaveBeenCalledWith('server1', mockConfig2);
      expect(registry.privateServersCache.updateServerConfigIfExists).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        '[MCP][PrivateServer][server1] Promoted private server update',
      );
    });

    it('should throw error if updateServerConfigIfExists fails', async () => {
      (registry.getServerConfig as jest.Mock).mockResolvedValue(undefined);
      (registry.privateServersCache.updateServerConfigIfExists as jest.Mock).mockRejectedValue(
        new Error('Redis update failed'),
      );

      await expect(
        MCPPrivateServerLoader.updatePrivateServer('server1', mockConfig2),
      ).rejects.toThrow('Redis update failed');
    });

    it('should throw error if removeServer fails for promoted server', async () => {
      (registry.getServerConfig as jest.Mock).mockResolvedValue(mockConfig1);
      (registry.removeServer as jest.Mock).mockRejectedValue(new Error('Remove server failed'));

      await expect(
        MCPPrivateServerLoader.updatePrivateServer('server1', mockConfig2),
      ).rejects.toThrow('Remove server failed');
    });

    it('should throw error if addSharedServer fails for promoted server', async () => {
      (registry.getServerConfig as jest.Mock).mockResolvedValue(mockConfig1);
      (registry.removeServer as jest.Mock).mockResolvedValue(undefined); // Ensure removeServer succeeds
      (registry.addSharedServer as jest.Mock).mockRejectedValue(
        new Error('Add shared server failed'),
      );

      await expect(
        MCPPrivateServerLoader.updatePrivateServer('server1', mockConfig2),
      ).rejects.toThrow('Add shared server failed');
    });
  });

  describe('updatePrivateServerAccess()', () => {
    it('should revoke access from all users when allowedUserIds is empty', async () => {
      (registry.privateServersCache.findUsersWithServer as jest.Mock).mockResolvedValue([
        'user1',
        'user2',
        'user3',
      ]);

      await MCPPrivateServerLoader.updatePrivateServerAccess('server1', [], mockConfig1);

      expect(registry.privateServersCache.findUsersWithServer).toHaveBeenCalledWith('server1');
      expect(registry.privateServersCache.removeServerConfigIfCacheExists).toHaveBeenCalledWith(
        ['user1', 'user2', 'user3'],
        'server1',
      );
      expect(logger.info).toHaveBeenCalledWith(
        '[MCP][PrivateServer][server1] Revoking access from all users',
      );
    });

    it('should grant access to new users and revoke from removed users', async () => {
      const allowedUserIds = ['user1', 'user2', 'user4'];
      (registry.privateServersCache.findUsersWithServer as jest.Mock).mockResolvedValue([
        'user1',
        'user2',
        'user3',
      ]);

      await MCPPrivateServerLoader.updatePrivateServerAccess(
        'server1',
        allowedUserIds,
        mockConfig1,
      );

      // Should revoke from user3 (no longer in allowed list)
      expect(registry.privateServersCache.removeServerConfigIfCacheExists).toHaveBeenCalledWith(
        ['user3'],
        'server1',
      );

      // Should grant to all allowed users (includes existing and new)
      expect(registry.privateServersCache.addServerConfigIfCacheExists).toHaveBeenCalledWith(
        allowedUserIds,
        'server1',
        mockConfig1,
      );

      expect(logger.info).toHaveBeenCalledWith(
        '[MCP][PrivateServer][server1] Updating access for 3 users',
      );
      expect(logger.debug).toHaveBeenCalledWith(
        '[MCP][PrivateServer][server1] Revoking access from 1 users',
      );
      expect(logger.debug).toHaveBeenCalledWith(
        '[MCP][PrivateServer][server1] Granting access to 3 users',
      );
    });

    it('should only grant access when no users currently have the server', async () => {
      const allowedUserIds = ['user1', 'user2'];
      (registry.privateServersCache.findUsersWithServer as jest.Mock).mockResolvedValue([]);

      await MCPPrivateServerLoader.updatePrivateServerAccess(
        'server1',
        allowedUserIds,
        mockConfig1,
      );

      expect(registry.privateServersCache.removeServerConfigIfCacheExists).not.toHaveBeenCalled();
      expect(registry.privateServersCache.addServerConfigIfCacheExists).toHaveBeenCalledWith(
        allowedUserIds,
        'server1',
        mockConfig1,
      );
    });

    it('should only revoke access when granting to users who already have it', async () => {
      const allowedUserIds = ['user1', 'user2'];
      (registry.privateServersCache.findUsersWithServer as jest.Mock).mockResolvedValue([
        'user1',
        'user2',
      ]);

      await MCPPrivateServerLoader.updatePrivateServerAccess(
        'server1',
        allowedUserIds,
        mockConfig1,
      );

      // No one to revoke
      expect(registry.privateServersCache.removeServerConfigIfCacheExists).not.toHaveBeenCalled();

      // Still grant (idempotent)
      expect(registry.privateServersCache.addServerConfigIfCacheExists).toHaveBeenCalledWith(
        allowedUserIds,
        'server1',
        mockConfig1,
      );
    });

    it('should handle completely new access list', async () => {
      const allowedUserIds = ['user4', 'user5', 'user6'];
      (registry.privateServersCache.findUsersWithServer as jest.Mock).mockResolvedValue([
        'user1',
        'user2',
        'user3',
      ]);

      await MCPPrivateServerLoader.updatePrivateServerAccess(
        'server1',
        allowedUserIds,
        mockConfig1,
      );

      // Revoke from all current users
      expect(registry.privateServersCache.removeServerConfigIfCacheExists).toHaveBeenCalledWith(
        ['user1', 'user2', 'user3'],
        'server1',
      );

      // Grant to all new users
      expect(registry.privateServersCache.addServerConfigIfCacheExists).toHaveBeenCalledWith(
        allowedUserIds,
        'server1',
        mockConfig1,
      );
    });

    it('should throw error if findUsersWithServer fails', async () => {
      (registry.privateServersCache.findUsersWithServer as jest.Mock).mockRejectedValue(
        new Error('Redis scan failed'),
      );

      await expect(
        MCPPrivateServerLoader.updatePrivateServerAccess('server1', [], mockConfig1),
      ).rejects.toThrow('Redis scan failed');
    });
  });

  describe('promoteToSharedServer()', () => {
    it('should promote private server to shared registry and remove from private caches', async () => {
      (registry.addSharedServer as jest.Mock).mockResolvedValue(undefined);
      (registry.privateServersCache.findUsersWithServer as jest.Mock).mockResolvedValue([
        'user1',
        'user2',
        'user3',
      ]);

      await MCPPrivateServerLoader.promoteToSharedServer('server1', mockConfig1);

      // Should add to shared registry
      expect(registry.addSharedServer).toHaveBeenCalledWith('server1', mockConfig1);

      // Should remove from all private user caches
      expect(registry.privateServersCache.removeServerConfigIfCacheExists).toHaveBeenCalledWith(
        ['user1', 'user2', 'user3'],
        'server1',
      );

      expect(logger.info).toHaveBeenCalledWith(
        '[MCP][PrivateServer][server1] Promoting to shared server',
      );
      expect(logger.info).toHaveBeenCalledWith(
        '[MCP][PrivateServer][server1] Successfully promoted to shared server',
      );
    });

    it('should handle promoting when no users have the server privately', async () => {
      (registry.addSharedServer as jest.Mock).mockResolvedValue(undefined);
      (registry.privateServersCache.findUsersWithServer as jest.Mock).mockResolvedValue([]);

      await MCPPrivateServerLoader.promoteToSharedServer('server1', mockConfig1);

      expect(registry.addSharedServer).toHaveBeenCalledWith('server1', mockConfig1);
      expect(registry.privateServersCache.removeServerConfigIfCacheExists).not.toHaveBeenCalled();
    });

    it('should throw error if addSharedServer fails', async () => {
      (registry.addSharedServer as jest.Mock).mockRejectedValue(
        new Error('Failed to add to shared registry'),
      );

      await expect(
        MCPPrivateServerLoader.promoteToSharedServer('server1', mockConfig1),
      ).rejects.toThrow('Failed to add to shared registry');
    });
  });

  describe('demoteToPrivateServer()', () => {
    it('should demote shared server to private caches for specified users', async () => {
      const allowedUserIds = ['user1', 'user2', 'user3'];
      (registry.removeServer as jest.Mock).mockResolvedValue(undefined);

      await MCPPrivateServerLoader.demoteToPrivateServer('server1', allowedUserIds, mockConfig1);

      // Should remove from shared registry
      expect(registry.removeServer).toHaveBeenCalledWith('server1');

      // Should add to private caches for allowed users
      expect(registry.privateServersCache.addServerConfigIfCacheExists).toHaveBeenCalledWith(
        allowedUserIds,
        'server1',
        mockConfig1,
      );

      expect(logger.info).toHaveBeenCalledWith(
        '[MCP][PrivateServer][server1] Demoting to private server',
      );
      expect(logger.info).toHaveBeenCalledWith(
        '[MCP][PrivateServer][server1] Successfully demoted to private server',
      );
    });

    it('should handle demoting with empty user list', async () => {
      (registry.removeServer as jest.Mock).mockResolvedValue(undefined);

      await MCPPrivateServerLoader.demoteToPrivateServer('server1', [], mockConfig1);

      expect(registry.removeServer).toHaveBeenCalledWith('server1');
      expect(registry.privateServersCache.addServerConfigIfCacheExists).not.toHaveBeenCalled();
    });

    it('should throw error if removeServer fails', async () => {
      (registry.removeServer as jest.Mock).mockRejectedValue(
        new Error('Server not found in shared registry'),
      );

      await expect(
        MCPPrivateServerLoader.demoteToPrivateServer('server1', ['user1'], mockConfig1),
      ).rejects.toThrow('Server not found in shared registry');
    });
  });

  describe('addPrivateServer()', () => {
    it('should add private server for a user', async () => {
      await MCPPrivateServerLoader.addPrivateServer('user1', 'server1', mockConfig1);

      expect(registry.privateServersCache.add).toHaveBeenCalledWith(
        'user1',
        'server1',
        mockConfig1,
      );
      expect(logger.info).toHaveBeenCalledWith(
        '[MCP][PrivateServer][server1] add private server to user with Id user1',
      );
    });

    it('should add private server with different configs for different users', async () => {
      await MCPPrivateServerLoader.addPrivateServer('user1', 'server1', mockConfig1);
      await MCPPrivateServerLoader.addPrivateServer('user2', 'server2', mockConfig2);

      expect(registry.privateServersCache.add).toHaveBeenCalledWith(
        'user1',
        'server1',
        mockConfig1,
      );
      expect(registry.privateServersCache.add).toHaveBeenCalledWith(
        'user2',
        'server2',
        mockConfig2,
      );
    });

    it('should throw error if cache add fails', async () => {
      (registry.privateServersCache.add as jest.Mock).mockRejectedValue(
        new Error('Cache write failed'),
      );

      await expect(
        MCPPrivateServerLoader.addPrivateServer('user1', 'server1', mockConfig1),
      ).rejects.toThrow('Cache write failed');
    });

    it('should handle adding server with complex config', async () => {
      const complexConfig: t.ParsedServerConfig = {
        url: 'https://api.example.com',
        requiresOAuth: true,
        lastUpdatedAt: Date.now(),
      };

      // Reset the mock to ensure it succeeds for this test
      (registry.privateServersCache.add as jest.Mock).mockResolvedValue(undefined);

      await MCPPrivateServerLoader.addPrivateServer('user1', 'complex-server', complexConfig);

      expect(registry.privateServersCache.add).toHaveBeenCalledWith(
        'user1',
        'complex-server',
        complexConfig,
      );
    });
  });
});
