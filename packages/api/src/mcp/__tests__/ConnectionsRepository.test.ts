import { logger } from '@librechat/data-schemas';
import { ConnectionsRepository } from '../ConnectionsRepository';
import { MCPConnectionFactory } from '../MCPConnectionFactory';
import { MCPConnection } from '../connection';
import type * as t from '../types';

// Mock external dependencies
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('../MCPConnectionFactory', () => ({
  MCPConnectionFactory: {
    create: jest.fn(),
  },
}));

jest.mock('../connection');

// Mock the registry
const mockRegistryInstance = {
  getServerConfig: jest.fn(),
  getAllServerConfigs: jest.fn(),
};

jest.mock('../registry/MCPServersRegistry', () => ({
  MCPServersRegistry: {
    getInstance: () => mockRegistryInstance,
  },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;

// Use mocked registry instance
const mockRegistry = mockRegistryInstance as jest.Mocked<typeof mockRegistryInstance>;

describe('ConnectionsRepository', () => {
  let repository: ConnectionsRepository;
  let mockServerConfigs: Record<string, t.ParsedServerConfig>;
  let mockConnection: jest.Mocked<MCPConnection>;

  beforeEach(() => {
    mockServerConfigs = {
      server1: { url: 'http://localhost:3001' },
      server2: { command: 'test-command', args: ['--test'] },
      server3: { url: 'ws://localhost:8080', type: 'websocket' },
    };

    // Setup mock registry
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mockRegistry.getServerConfig = jest.fn((serverName: string, ownerId?: string) =>
      Promise.resolve(mockServerConfigs[serverName] || undefined),
    ) as jest.Mock;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mockRegistry.getAllServerConfigs = jest.fn((ownerId?: string) =>
      Promise.resolve(mockServerConfigs),
    ) as jest.Mock;

    mockConnection = {
      isConnected: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(undefined),
      createdAt: Date.now(),
      isStale: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<MCPConnection>;

    (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);

    // Create repository with undefined ownerId (app-level)
    repository = new ConnectionsRepository(undefined);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('has', () => {
    it('should return true for existing server', async () => {
      expect(await repository.has('server1')).toBe(true);
    });

    it('should return false for non-existing server', async () => {
      expect(await repository.has('nonexistent')).toBe(false);
    });
  });

  describe('get', () => {
    it('should return existing connected connection', async () => {
      mockConnection.isConnected.mockResolvedValue(true);
      repository['connections'].set('server1', mockConnection);

      const result = await repository.get('server1');

      expect(result).toBe(mockConnection);
      expect(MCPConnectionFactory.create).not.toHaveBeenCalled();
    });

    it('should create new connection if none exists', async () => {
      const result = await repository.get('server1');

      expect(result).toBe(mockConnection);
      expect(MCPConnectionFactory.create).toHaveBeenCalledWith(
        {
          serverName: 'server1',
          serverConfig: mockServerConfigs.server1,
        },
        undefined,
      );
      expect(repository['connections'].get('server1')).toBe(mockConnection);
    });

    it('should create new connection if existing connection is not connected', async () => {
      const oldConnection = {
        isConnected: jest.fn().mockResolvedValue(false),
        disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<MCPConnection>;
      repository['connections'].set('server1', oldConnection);

      const result = await repository.get('server1');

      expect(result).toBe(mockConnection);
      expect(oldConnection.disconnect).toHaveBeenCalled();
      expect(MCPConnectionFactory.create).toHaveBeenCalledWith(
        {
          serverName: 'server1',
          serverConfig: mockServerConfigs.server1,
        },
        undefined,
      );
    });

    it('should recreate connection when existing connection is stale', async () => {
      const connectionCreatedAt = Date.now();
      const configCachedAt = connectionCreatedAt + 10000; // Config updated 10 seconds after connection was created

      const staleConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn().mockResolvedValue(undefined),
        createdAt: connectionCreatedAt,
        isStale: jest.fn().mockReturnValue(true),
      } as unknown as jest.Mocked<MCPConnection>;

      // Update server config with updatedAt timestamp
      const configWithCachedAt = {
        ...mockServerConfigs.server1,
        updatedAt: configCachedAt,
      };
      mockRegistry.getServerConfig.mockResolvedValueOnce(configWithCachedAt);

      repository['connections'].set('server1', staleConnection);

      const result = await repository.get('server1');

      // Verify stale check was called with the config's updatedAt timestamp
      expect(staleConnection.isStale).toHaveBeenCalledWith(configCachedAt);

      // Verify old connection was disconnected
      expect(staleConnection.disconnect).toHaveBeenCalled();

      // Verify new connection was created
      expect(MCPConnectionFactory.create).toHaveBeenCalledWith(
        {
          serverName: 'server1',
          serverConfig: configWithCachedAt,
        },
        undefined,
      );

      // Verify new connection is returned
      expect(result).toBe(mockConnection);

      // Verify the new connection replaced the stale one in the repository
      expect(repository['connections'].get('server1')).toBe(mockConnection);
      expect(repository['connections'].get('server1')).not.toBe(staleConnection);
    });

    it('should return existing connection when it is not stale', async () => {
      const connectionCreatedAt = Date.now();
      const configCachedAt = connectionCreatedAt - 10000; // Config is older than connection

      const freshConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn().mockResolvedValue(undefined),
        createdAt: connectionCreatedAt,
        isStale: jest.fn().mockReturnValue(false),
      } as unknown as jest.Mocked<MCPConnection>;

      // Update server config with updatedAt timestamp
      const configWithCachedAt = {
        ...mockServerConfigs.server1,
        updatedAt: configCachedAt,
      };
      mockRegistry.getServerConfig.mockResolvedValueOnce(configWithCachedAt);

      repository['connections'].set('server1', freshConnection);

      const result = await repository.get('server1');

      // Verify stale check was called
      expect(freshConnection.isStale).toHaveBeenCalledWith(configCachedAt);

      // Verify connection was not disconnected
      expect(freshConnection.disconnect).not.toHaveBeenCalled();

      // Verify no new connection was created
      expect(MCPConnectionFactory.create).not.toHaveBeenCalled();

      // Verify existing connection is returned
      expect(result).toBe(freshConnection);

      // Verify repository still has the same connection
      expect(repository['connections'].get('server1')).toBe(freshConnection);
    });
    //todo revist later when async getAll(): in packages/api/src/mcp/ConnectionsRepository.ts is refactored
    it.skip('should throw error for non-existent server configuration', async () => {
      await expect(repository.get('nonexistent')).rejects.toThrow(
        '[MCP][nonexistent] Server not found in configuration',
      );
    });

    it('should handle MCPConnectionFactory.create errors', async () => {
      const createError = new Error('Connection creation failed');
      (MCPConnectionFactory.create as jest.Mock).mockRejectedValue(createError);

      await expect(repository.get('server1')).rejects.toThrow('Connection creation failed');
    });
  });

  describe('getMany', () => {
    it('should return connections for multiple servers', async () => {
      const result = await repository.getMany(['server1', 'server3']);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get('server1')).toBe(mockConnection);
      expect(result.get('server3')).toBe(mockConnection);
    });
  });

  describe('getLoaded', () => {
    it('should return connections for loaded servers only', async () => {
      // Load one connection
      await repository.get('server1');

      const result = await repository.getLoaded();

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(1);
      expect(result.get('server1')).toBe(mockConnection);
    });

    it('should return empty map when no connections are loaded', async () => {
      const result = await repository.getLoaded();

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });

  describe('getAll', () => {
    it('should return connections for all configured servers', async () => {
      const result = await repository.getAll();

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(3);
      expect(result.get('server1')).toBe(mockConnection);
      expect(result.get('server2')).toBe(mockConnection);
      expect(result.get('server3')).toBe(mockConnection);
    });
  });

  describe('disconnect', () => {
    it('should disconnect and remove existing connection', async () => {
      repository['connections'].set('server1', mockConnection);

      await repository.disconnect('server1');

      expect(mockConnection.disconnect).toHaveBeenCalled();
      expect(repository['connections'].has('server1')).toBe(false);
    });

    it('should handle disconnect error gracefully', async () => {
      const disconnectError = new Error('Disconnect failed');
      mockConnection.disconnect.mockRejectedValue(disconnectError);
      repository['connections'].set('server1', mockConnection);

      await repository.disconnect('server1');

      expect(mockConnection.disconnect).toHaveBeenCalled();
      expect(repository['connections'].has('server1')).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[MCP][server1] Error disconnecting',
        disconnectError,
      );
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all active connections', () => {
      const mockConnection1 = {
        disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<MCPConnection>;
      const mockConnection2 = {
        disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<MCPConnection>;
      const mockConnection3 = {
        disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<MCPConnection>;

      repository['connections'].set('server1', mockConnection1);
      repository['connections'].set('server2', mockConnection2);
      repository['connections'].set('server3', mockConnection3);

      const promises = repository.disconnectAll();

      expect(promises).toHaveLength(3);
      expect(Array.isArray(promises)).toBe(true);
    });
  });

  describe('Connection policy (isAllowedToConnectToServer)', () => {
    describe('App-level repository (ownerId = undefined)', () => {
      beforeEach(() => {
        repository = new ConnectionsRepository(undefined);
      });

      it('should allow connection to regular servers (startup !== false, !requiresOAuth)', async () => {
        mockServerConfigs.regularServer = {
          type: 'stdio',
          command: 'test',
          args: [],
          startup: true,
          requiresOAuth: false,
        };

        expect(await repository.has('regularServer')).toBe(true);
      });

      it('should allow connection when startup is undefined and requiresOAuth is false', async () => {
        mockServerConfigs.defaultServer = {
          type: 'stdio',
          command: 'test',
          args: [],
          requiresOAuth: false,
        };

        expect(await repository.has('defaultServer')).toBe(true);
      });

      it('should NOT allow connection to OAuth servers', async () => {
        mockServerConfigs.oauthServer = {
          type: 'streamable-http',
          url: 'http://example.com',
          requiresOAuth: true,
        };

        expect(await repository.has('oauthServer')).toBe(false);
      });

      it('should NOT allow connection to disabled servers (startup: false)', async () => {
        mockServerConfigs.disabledServer = {
          type: 'stdio',
          command: 'test',
          args: [],
          startup: false,
          requiresOAuth: false,
        };

        expect(await repository.has('disabledServer')).toBe(false);
      });

      it('should NOT allow connection to OAuth servers that are also disabled', async () => {
        mockServerConfigs.oauthDisabledServer = {
          type: 'streamable-http',
          url: 'http://example.com',
          startup: false,
          requiresOAuth: true,
        };

        expect(await repository.has('oauthDisabledServer')).toBe(false);
      });

      it('should disconnect existing connection when server becomes not allowed', async () => {
        // Initially setup as regular server
        mockServerConfigs.changingServer = {
          type: 'stdio',
          command: 'test',
          args: [],
          requiresOAuth: false,
        };

        // Create connection
        const connection = await repository.get('changingServer');
        expect(connection).toBe(mockConnection);
        expect(repository['connections'].has('changingServer')).toBe(true);

        // Change config to require OAuth (app-level can't connect)
        mockServerConfigs.changingServer = {
          type: 'streamable-http',
          url: 'http://example.com',
          requiresOAuth: true,
        };

        // Check if connection is allowed
        const allowed = await repository.has('changingServer');

        expect(allowed).toBe(false);
        expect(mockConnection.disconnect).toHaveBeenCalled();
      });
    });

    describe('User-level repository (ownerId = userId)', () => {
      beforeEach(() => {
        repository = new ConnectionsRepository('user123');
      });

      it('should allow connection to regular servers', async () => {
        mockServerConfigs.regularServer = {
          type: 'stdio',
          command: 'test',
          args: [],
          startup: true,
          requiresOAuth: false,
        };

        expect(await repository.has('regularServer')).toBe(true);
      });

      it('should allow connection to OAuth servers', async () => {
        mockServerConfigs.oauthServer = {
          type: 'streamable-http',
          url: 'http://example.com',
          requiresOAuth: true,
        };

        expect(await repository.has('oauthServer')).toBe(true);
      });

      it('should allow connection to disabled servers (startup: false)', async () => {
        mockServerConfigs.disabledServer = {
          type: 'stdio',
          command: 'test',
          args: [],
          startup: false,
          requiresOAuth: false,
        };

        expect(await repository.has('disabledServer')).toBe(true);
      });

      it('should allow connection to OAuth servers that are also disabled', async () => {
        mockServerConfigs.oauthDisabledServer = {
          type: 'streamable-http',
          url: 'http://example.com',
          startup: false,
          requiresOAuth: true,
        };

        expect(await repository.has('oauthDisabledServer')).toBe(true);
      });

      it('should return null from get() when server config does not exist', async () => {
        const connection = await repository.get('nonexistent');
        expect(connection).toBeNull();
      });
    });
  });
});
