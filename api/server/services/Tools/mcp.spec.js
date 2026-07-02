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
    const serverConfig = {
      type: 'streamable-http',
      url: 'https://thingy.example.com/messages/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
      source: 'yaml',
    };
    mockGetConnection.mockResolvedValue({
      disconnect,
      fetchTools: jest.fn().mockResolvedValue(tools),
    });

    await reinitMCPServer({
      user,
      serverName,
      serverConfig,
      requestBody: { messageId: 'msg-789' },
      userMCPAuthMap: undefined,
    });

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(mockUpdateMCPServerTools).toHaveBeenCalledWith(
      expect.objectContaining({
        tools,
        serverConfig,
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

describe('reinitMCPServer — runtime BODY placeholder fallback (issue #14074)', () => {
  const user = { id: 'user-123' };
  const serverName = 'Thingy';
  /** Matches the error `UserConnectionManager#getUserConnection` throws when a
   *  server config needs `{{LIBRECHAT_BODY_*}}` fields the request doesn't have. */
  const missingBodyPlaceholderError = new Error(
    `[MCP][User: ${user.id}][${serverName}] Request body field(s) required to resolve runtime MCP placeholders: conversationId.`,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMCPServerTools.mockResolvedValue({});
  });

  it('falls back to tool discovery instead of failing outright when body placeholders are unavailable', async () => {
    mockGetConnection.mockRejectedValue(missingBodyPlaceholderError);
    const tools = [{ name: 'search', inputSchema: { type: 'object', properties: {} } }];
    mockDiscoverServerTools.mockResolvedValue({ tools, oauthRequired: false, oauthUrl: null });

    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig: {
        type: 'streamable-http',
        url: 'https://thingy.example.com/mcp',
        headers: { 'X-Conversation-Id': '{{LIBRECHAT_BODY_CONVERSATIONID}}' },
      },
      userMCPAuthMap: undefined,
    });

    expect(mockDiscoverServerTools).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      oauthRequired: false,
      tools,
    });
    expect(result.message).not.toMatch(/^Failed to reinitialize/);
  });

  it('reports a non-failure state (not the generic "Failed to reinitialize" message) when no tools are found yet', async () => {
    mockGetConnection.mockRejectedValue(missingBodyPlaceholderError);
    mockDiscoverServerTools.mockResolvedValue({
      tools: null,
      oauthRequired: false,
      oauthUrl: null,
    });

    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig: {
        type: 'streamable-http',
        url: 'https://thingy.example.com/mcp',
        headers: { 'X-Conversation-Id': '{{LIBRECHAT_BODY_CONVERSATIONID}}' },
      },
      userMCPAuthMap: undefined,
    });

    expect(result.oauthRequired).toBe(false);
    expect(result.message).not.toMatch(/^Failed to reinitialize/);
  });

  it('still treats unrelated connection errors as real failures', async () => {
    mockGetConnection.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig: { type: 'streamable-http', url: 'https://thingy.example.com/mcp' },
      userMCPAuthMap: undefined,
    });

    expect(mockDiscoverServerTools).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.message).toBe(`Failed to reinitialize MCP server '${serverName}'`);
  });
});
