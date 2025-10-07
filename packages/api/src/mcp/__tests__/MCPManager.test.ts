import { logger } from '@librechat/data-schemas';
import type * as t from '~/mcp/types';
import { MCPManager } from '~/mcp/MCPManager';
import { MCPServersRegistry } from '~/mcp/MCPServersRegistry';
import { ConnectionsRepository } from '~/mcp/ConnectionsRepository';
import { MCPConnection } from '../connection';

// Mock external dependencies
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('~/mcp/MCPServersRegistry');
jest.mock('~/mcp/ConnectionsRepository');

const mockLogger = logger as jest.Mocked<typeof logger>;

describe('MCPManager', () => {
  const userId = 'test-user-123';
  const serverName = 'test_server';

  beforeEach(() => {
    // Reset MCPManager singleton state
    (MCPManager as unknown as { instance: null }).instance = null;
    jest.clearAllMocks();
  });

  function mockRegistry(
    registryConfig: Partial<MCPServersRegistry>,
  ): jest.MockedClass<typeof MCPServersRegistry> {
    const mock = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getToolFunctions: jest.fn().mockResolvedValue(null),
      ...registryConfig,
    };
    return (MCPServersRegistry as jest.MockedClass<typeof MCPServersRegistry>).mockImplementation(
      () => mock as unknown as MCPServersRegistry,
    );
  }

  function mockAppConnections(
    appConnectionsConfig: Partial<ConnectionsRepository>,
  ): jest.MockedClass<typeof ConnectionsRepository> {
    const mock = {
      has: jest.fn().mockReturnValue(false),
      get: jest.fn().mockResolvedValue({} as unknown as MCPConnection),
      ...appConnectionsConfig,
    };
    return (
      ConnectionsRepository as jest.MockedClass<typeof ConnectionsRepository>
    ).mockImplementation(() => mock as unknown as ConnectionsRepository);
  }

  function newMCPServersConfig(serverNameOverride?: string): t.MCPServers {
    return {
      [serverNameOverride ?? serverName]: {
        type: 'stdio',
        command: 'test',
        args: [],
      },
    };
  }

  describe('getServerToolFunctions', () => {
    it('should catch and handle errors gracefully', async () => {
      mockRegistry({
        getToolFunctions: jest.fn(() => {
          throw new Error('Connection failed');
        }),
      });

      mockAppConnections({
        has: jest.fn().mockReturnValue(true),
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      const result = await manager.getServerToolFunctions(userId, serverName);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        `[getServerToolFunctions] Error getting tool functions for server ${serverName}`,
        expect.any(Error),
      );
    });

    it('should catch synchronous errors from getUserConnections', async () => {
      mockRegistry({
        getToolFunctions: jest.fn().mockResolvedValue({}),
      });

      mockAppConnections({
        has: jest.fn().mockReturnValue(false),
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      const spy = jest.spyOn(manager, 'getUserConnections').mockImplementation(() => {
        throw new Error('Failed to get user connections');
      });

      const result = await manager.getServerToolFunctions(userId, serverName);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        `[getServerToolFunctions] Error getting tool functions for server ${serverName}`,
        expect.any(Error),
      );
      expect(spy).toHaveBeenCalled();
    });

    it('should return tools successfully when no errors occur', async () => {
      const expectedTools: t.LCAvailableTools = {
        [`test_tool_mcp_${serverName}`]: {
          type: 'function',
          function: {
            name: `test_tool_mcp_${serverName}`,
            description: 'Test tool',
            parameters: { type: 'object' },
          },
        },
      };

      mockRegistry({
        getToolFunctions: jest.fn().mockResolvedValue(expectedTools),
      });

      mockAppConnections({
        has: jest.fn().mockReturnValue(true),
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      const result = await manager.getServerToolFunctions(userId, serverName);

      expect(result).toEqual(expectedTools);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should include specific server name in error messages', async () => {
      const specificServerName = 'github_mcp_server';

      mockRegistry({
        getToolFunctions: jest.fn(() => {
          throw new Error('Server specific error');
        }),
      });

      mockAppConnections({
        has: jest.fn().mockReturnValue(true),
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig(specificServerName));

      const result = await manager.getServerToolFunctions(userId, specificServerName);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        `[getServerToolFunctions] Error getting tool functions for server ${specificServerName}`,
        expect.any(Error),
      );
    });
  });
});
