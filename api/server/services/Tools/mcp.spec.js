const { Constants } = require('librechat-data-provider');

const mockGetConnection = jest.fn();
const mockDiscoverServerTools = jest.fn();
const mockGetGraphApiToken = jest.fn();
const mockUpdateMCPServerTools = jest.fn();

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(() => ({
    getConnection: mockGetConnection,
    discoverServerTools: mockDiscoverServerTools,
  })),
  getMCPServersRegistry: jest.fn(() => ({ getServerConfig: jest.fn() })),
  getFlowStateManager: jest.fn(() => ({})),
}));
jest.mock('~/models', () => ({
  findToken: jest.fn(),
  createToken: jest.fn(),
  updateToken: jest.fn(),
  deleteTokens: jest.fn(),
}));
jest.mock('~/server/services/Config', () => ({
  updateMCPServerTools: mockUpdateMCPServerTools,
}));
jest.mock('~/server/services/GraphTokenService', () => ({
  getGraphApiToken: mockGetGraphApiToken,
}));
jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => ({})),
}));

const { reinitMCPServer } = require('./mcp');

describe('reinitMCPServer — customUserVars gating (issue #10969)', () => {
  const user = { id: 'user-123' };
  const serverName = 'Thingy';
  const serverConfig = {
    type: 'streamable-http',
    url: 'https://thingy.example.com/mcp',
    customUserVars: {
      THINGY_TOKEN: { title: 'Thingy Access Token', description: 'Create this in Thingy' },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMCPServerTools.mockResolvedValue({});
  });

  it('does not connect and exposes no tools when a required customUserVar is unset', async () => {
    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig,
      userMCPAuthMap: undefined,
    });

    expect(mockGetConnection).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      availableTools: null,
      success: false,
      tools: null,
      oauthRequired: false,
      serverName,
    });
    expect(result.message).toContain('THINGY_TOKEN');
  });

  it('does not connect when the stored value for a required customUserVar is empty', async () => {
    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig,
      userMCPAuthMap: { [`${Constants.mcp_prefix}${serverName}`]: { THINGY_TOKEN: '' } },
    });

    expect(mockGetConnection).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.availableTools).toBeNull();
  });

  it('proceeds to connect once every required customUserVar is provided', async () => {
    mockGetConnection.mockResolvedValue({ fetchTools: jest.fn().mockResolvedValue([]) });

    await reinitMCPServer({
      user,
      serverName,
      serverConfig,
      userMCPAuthMap: {
        [`${Constants.mcp_prefix}${serverName}`]: { THINGY_TOKEN: 'secret-token' },
      },
    });

    expect(mockGetConnection).toHaveBeenCalledTimes(1);
    expect(mockGetConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName,
        customUserVars: { THINGY_TOKEN: 'secret-token' },
      }),
    );
  });

  it('passes request body and Graph resolver into connection creation', async () => {
    mockGetConnection.mockResolvedValue({ fetchTools: jest.fn().mockResolvedValue([]) });
    const requestBody = { conversationId: 'conv-123', messageId: 'msg-123' };

    await reinitMCPServer({
      user,
      serverName,
      serverConfig: { type: 'streamable-http', url: 'https://thingy.example.com/mcp' },
      requestBody,
      userMCPAuthMap: undefined,
    });

    expect(mockGetConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody,
        graphTokenResolver: mockGetGraphApiToken,
      }),
    );
  });

  it('passes request body and Graph resolver into OAuth discovery fallback', async () => {
    mockGetConnection.mockRejectedValue(new Error('OAuth authentication required'));
    mockDiscoverServerTools.mockResolvedValue({ tools: [], oauthRequired: true, oauthUrl: null });
    const requestBody = { conversationId: 'conv-456', messageId: 'msg-456' };

    await reinitMCPServer({
      user,
      serverName,
      serverConfig: { type: 'streamable-http', url: 'https://thingy.example.com/mcp' },
      requestBody,
      userMCPAuthMap: undefined,
    });

    expect(mockDiscoverServerTools).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody,
        graphTokenResolver: mockGetGraphApiToken,
      }),
    );
  });

  it('disconnects ephemeral BODY-scoped connections after loading tools', async () => {
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const tools = [{ name: 'search', inputSchema: { type: 'object', properties: {} } }];
    mockGetConnection.mockResolvedValue({
      disconnect,
      fetchTools: jest.fn().mockResolvedValue(tools),
    });

    await reinitMCPServer({
      user,
      serverName,
      serverConfig: {
        type: 'streamable-http',
        url: 'https://thingy.example.com/messages/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
        source: 'yaml',
      },
      requestBody: { messageId: 'msg-789' },
      userMCPAuthMap: undefined,
    });

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(mockUpdateMCPServerTools).toHaveBeenCalledWith(
      expect.objectContaining({
        tools,
        skipCache: true,
      }),
    );
  });

  it('proceeds to connect when the server declares no customUserVars', async () => {
    mockGetConnection.mockResolvedValue({ fetchTools: jest.fn().mockResolvedValue([]) });

    await reinitMCPServer({
      user,
      serverName,
      serverConfig: { type: 'streamable-http', url: 'https://thingy.example.com/mcp' },
      userMCPAuthMap: undefined,
    });

    expect(mockGetConnection).toHaveBeenCalledTimes(1);
  });
});
