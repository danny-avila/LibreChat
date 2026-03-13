import { Constants } from 'librechat-data-provider';

import type { TokenMethods, IUser } from '@librechat/data-schemas';
import type { AgentWithTools } from '~/agents/context';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens } from '~/mcp/oauth';
import type { RequestBody } from '~/types';

import { MCPManager } from '~/mcp/MCPManager';
import { MCPOAuthHandler } from '~/mcp/oauth';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';

import { reconnectOAuthMCPServers } from './reconnectOAuthMCPServers';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockRegistryInstance = {
  getOAuthServers: jest.fn(),
};

jest.mock('~/mcp/MCPManager');
jest.mock('~/mcp/oauth', () => ({
  MCPOAuthHandler: {
    generateFlowId: jest.fn(),
  },
}));
jest.mock('~/mcp/registry/MCPServersRegistry', () => ({
  MCPServersRegistry: {
    getInstance: () => mockRegistryInstance,
  },
}));

describe('reconnectOAuthMCPServers', () => {
  let flowManager: jest.Mocked<FlowStateManager<MCPOAuthTokens | null>>;
  let tokenMethods: jest.Mocked<
    Pick<TokenMethods, 'createToken' | 'deleteTokens' | 'findToken' | 'updateToken'>
  >;
  let user: IUser;
  let mockMCPManager: jest.Mocked<MCPManager>;
  let mockConnection: { isConnected: jest.Mock<Promise<boolean>, []> };
  let requestBody: RequestBody;
  let signal: AbortSignal;

  beforeEach(() => {
    jest.clearAllMocks();

    user = {
      id: 'user-123',
      email: 'user@example.com',
    } as IUser;

    flowManager = {
      deleteFlow: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<FlowStateManager<MCPOAuthTokens | null>>;

    tokenMethods = {
      createToken: jest.fn(),
      deleteTokens: jest.fn(),
      findToken: jest.fn(),
      updateToken: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<TokenMethods, 'createToken' | 'deleteTokens' | 'findToken' | 'updateToken'>
    >;

    mockConnection = {
      isConnected: jest.fn().mockResolvedValue(true),
    };

    mockMCPManager = {
      getConnection: jest.fn().mockResolvedValue(mockConnection),
      disconnectUserConnection: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MCPManager>;

    requestBody = {
      text: 'run this task',
    } as RequestBody;

    signal = new AbortController().signal;

    (MCPManager.getInstance as jest.Mock).mockReturnValue(mockMCPManager);
    (MCPOAuthHandler.generateFlowId as jest.Mock).mockImplementation(
      (userId: string, serverName: string) => `${userId}:${serverName}`,
    );
  });

  it('returns early when no OAuth MCP servers are used by the agents', async () => {
    (mockRegistryInstance.getOAuthServers as jest.Mock).mockResolvedValue(
      new Set(['oauth-server']),
    );

    const result = await reconnectOAuthMCPServers({
      user,
      signal,
      requestBody,
      flowManager,
      tokenMethods,
      agents: [
        {
          id: 'agent-1',
          toolDefinitions: [
            {
              name: `search${Constants.mcp_delimiter}plain-server`,
              description: '',
              parameters: { type: 'object' },
            },
          ],
        },
      ] as AgentWithTools[],
    });

    expect(result).toEqual({
      attemptedServers: [],
      connectedServers: [],
    });
    expect(mockMCPManager.getConnection).not.toHaveBeenCalled();
  });

  it('reconnects each unique OAuth MCP server used by the agent run', async () => {
    (mockRegistryInstance.getOAuthServers as jest.Mock).mockResolvedValue(
      new Set(['oauth-server-1', 'oauth-server-2', 'oauth-server-3']),
    );

    const userMCPAuthMap = {
      [`${Constants.mcp_prefix}oauth-server-1`]: {
        api_key: 'secret-1',
      },
      [`${Constants.mcp_prefix}oauth-server-2`]: {
        api_key: 'secret-2',
      },
    };

    const result = await reconnectOAuthMCPServers({
      user,
      signal,
      requestBody,
      flowManager,
      tokenMethods,
      userMCPAuthMap,
      agents: [
        {
          id: 'agent-1',
          toolDefinitions: [
            {
              name: `search${Constants.mcp_delimiter}oauth-server-1`,
              description: '',
              parameters: { type: 'object' },
            },
            {
              name: `fetch${Constants.mcp_delimiter}oauth-server-2`,
              description: '',
              parameters: { type: 'object' },
            },
          ],
        },
        {
          id: 'agent-2',
          toolDefinitions: [
            {
              name: `again${Constants.mcp_delimiter}oauth-server-1`,
              description: '',
              parameters: { type: 'object' },
            },
          ],
        },
      ] as AgentWithTools[],
    });

    expect(result).toEqual({
      attemptedServers: ['oauth-server-1', 'oauth-server-2'],
      connectedServers: ['oauth-server-1', 'oauth-server-2'],
    });
    expect(mockMCPManager.getConnection).toHaveBeenCalledTimes(2);
    expect(mockMCPManager.getConnection).toHaveBeenNthCalledWith(1, {
      user,
      signal,
      flowManager,
      requestBody,
      serverName: 'oauth-server-1',
      tokenMethods,
      returnOnOAuth: true,
      customUserVars: userMCPAuthMap[`${Constants.mcp_prefix}oauth-server-1`],
    });
    expect(mockMCPManager.getConnection).toHaveBeenNthCalledWith(2, {
      user,
      signal,
      flowManager,
      requestBody,
      serverName: 'oauth-server-2',
      tokenMethods,
      returnOnOAuth: true,
      customUserVars: userMCPAuthMap[`${Constants.mcp_prefix}oauth-server-2`],
    });
  });

  it('cleans up the OAuth flow and throws when reconnection fails', async () => {
    (mockRegistryInstance.getOAuthServers as jest.Mock).mockResolvedValue(
      new Set(['oauth-server']),
    );
    mockMCPManager.getConnection.mockRejectedValueOnce(new Error('invalid_token'));

    await expect(
      reconnectOAuthMCPServers({
        user,
        signal,
        requestBody,
        flowManager,
        tokenMethods,
        agents: [
          {
            id: 'agent-1',
            toolDefinitions: [
              {
                name: `search${Constants.mcp_delimiter}oauth-server`,
                description: '',
                parameters: { type: 'object' },
              },
            ],
          },
        ] as AgentWithTools[],
      }),
    ).rejects.toThrow(
      'OAuth MCP reconnection failed for scheduled task: oauth-server: invalid_token',
    );

    expect(MCPOAuthHandler.generateFlowId).toHaveBeenCalledWith(user.id, 'oauth-server');
    expect(flowManager.deleteFlow).toHaveBeenCalledWith(`${user.id}:oauth-server`, 'mcp_oauth');
    expect(mockMCPManager.disconnectUserConnection).toHaveBeenCalledWith(user.id, 'oauth-server');
  });
});
