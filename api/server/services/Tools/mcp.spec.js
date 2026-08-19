const { Constants } = require('librechat-data-provider');

const mockGetConnection = jest.fn();
const mockDiscoverServerTools = jest.fn();
const mockGetGraphApiToken = jest.fn();
const mockUpdateMCPServerTools = jest.fn();
const mockGetMCPToolsCacheGeneration = jest.fn().mockResolvedValue('generation-current');
const mockGetToolPublicationGeneration = jest.fn().mockReturnValue('generation-current');

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(() => ({
    getConnection: mockGetConnection,
    discoverServerTools: mockDiscoverServerTools,
    getToolPublicationGeneration: mockGetToolPublicationGeneration,
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
  getMCPToolsCacheGeneration: mockGetMCPToolsCacheGeneration,
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
      failureReason: 'missing_custom_user_vars',
      missingUserVars: ['THINGY_TOKEN'],
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

  it('updates the cache with an empty catalog after a successful connection', async () => {
    mockGetConnection.mockResolvedValue({ fetchTools: jest.fn().mockResolvedValue([]) });

    await reinitMCPServer({
      user,
      serverName,
      serverConfig: { type: 'streamable-http', url: 'https://thingy.example.com/mcp' },
      userMCPAuthMap: undefined,
    });

    expect(mockUpdateMCPServerTools).toHaveBeenCalledWith({
      userId: user.id,
      serverName,
      tools: [],
      serverConfig: { type: 'streamable-http', url: 'https://thingy.example.com/mcp' },
      publicationGeneration: 'generation-current',
    });
  });

  /** An app-level catalog write is dropped unless it carries the ordering reserved before its
   * own tools/list. When this path forwarded no revision, every publication was discarded and
   * agents were told the server had no tools at all (#14857). */
  it('publishes under the ordering its snapshot was fetched with', async () => {
    mockGetConnection.mockResolvedValue({
      fetchOrderedToolsSnapshot: jest.fn().mockResolvedValue({
        tools: [{ name: 'search', inputSchema: { type: 'object' } }],
        complete: true,
        publicationRevision: '7',
      }),
    });

    await reinitMCPServer({
      user,
      serverName,
      serverConfig: { type: 'streamable-http', url: 'https://thingy.example.com/mcp' },
    });

    expect(mockUpdateMCPServerTools).toHaveBeenCalledWith(
      expect.objectContaining({ serverName, publicationRevision: '7' }),
    );
  });

  it('asks the connection to republish a catalog it could not order', async () => {
    const refreshToolList = jest.fn().mockResolvedValue(undefined);
    mockGetConnection.mockResolvedValue({
      refreshToolList,
      fetchOrderedToolsSnapshot: jest.fn().mockResolvedValue({
        tools: [{ name: 'search', inputSchema: { type: 'object' } }],
        complete: true,
        orderingUnavailable: true,
      }),
    });

    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig: { type: 'streamable-http', url: 'https://thingy.example.com/mcp' },
    });

    expect(refreshToolList).toHaveBeenCalledTimes(1);
    expect(result.tools).toHaveLength(1);
  });

  it('preserves cached tools when live recovery returns an incomplete snapshot', async () => {
    const fetchOrderedToolsSnapshot = jest.fn().mockResolvedValue({
      tools: [{ name: 'partial', inputSchema: { type: 'object' } }],
      complete: false,
    });
    mockGetConnection.mockResolvedValue({
      fetchOrderedToolsSnapshot,
    });

    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig: { type: 'streamable-http', url: 'https://thingy.example.com/mcp' },
    });

    expect(result.tools).toBeNull();
    expect(fetchOrderedToolsSnapshot).toHaveBeenCalledTimes(1);
    expect(mockUpdateMCPServerTools).not.toHaveBeenCalled();
  });

  it('discards a snapshot when another replica rotates its generation during discovery', async () => {
    mockGetMCPToolsCacheGeneration
      .mockResolvedValueOnce('generation-current')
      .mockResolvedValueOnce('generation-replaced');
    mockGetConnection.mockResolvedValue({
      fetchOrderedToolsSnapshot: jest.fn().mockResolvedValue({
        tools: [{ name: 'stale', inputSchema: { type: 'object' } }],
        complete: true,
      }),
    });

    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig: { type: 'streamable-http', url: 'https://thingy.example.com/mcp' },
    });

    expect(result.tools).toBeNull();
    expect(result.availableTools).toBeNull();
    expect(mockUpdateMCPServerTools).not.toHaveBeenCalled();
  });

  it('does not return tools when the guarded publication loses its generation race', async () => {
    mockGetConnection.mockResolvedValue({
      fetchOrderedToolsSnapshot: jest.fn().mockResolvedValue({
        tools: [{ name: 'stale', inputSchema: { type: 'object' } }],
        complete: true,
      }),
    });
    mockUpdateMCPServerTools.mockResolvedValue(null);

    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig: { type: 'streamable-http', url: 'https://thingy.example.com/mcp' },
    });

    expect(result.tools).toBeNull();
    expect(result.availableTools).toBeNull();
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

    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig: { type: 'streamable-http', url: 'https://thingy.example.com/mcp' },
      requestBody,
      userMCPAuthMap: undefined,
    });

    expect(result).toMatchObject({
      success: false,
      failureReason: 'oauth_required',
      oauthRequired: true,
      oauthUrl: null,
    });
    expect(mockDiscoverServerTools).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody,
        graphTokenResolver: mockGetGraphApiToken,
      }),
    );
  });

  it('disposes ephemeral BODY-scoped connections after loading tools', async () => {
    const dispose = jest.fn().mockResolvedValue(undefined);
    const tools = [{ name: 'search', inputSchema: { type: 'object', properties: {} } }];
    const serverConfig = {
      type: 'streamable-http',
      url: 'https://thingy.example.com/messages/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
      source: 'yaml',
    };
    mockGetConnection.mockResolvedValue({
      dispose,
      fetchTools: jest.fn().mockResolvedValue(tools),
    });

    await reinitMCPServer({
      user,
      serverName,
      serverConfig,
      requestBody: { messageId: 'msg-789' },
      userMCPAuthMap: undefined,
    });

    expect(dispose).toHaveBeenCalledTimes(1);
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

describe('reinitMCPServer — runtime BODY placeholder pre-check (issue #14074)', () => {
  const user = { id: 'user-123' };
  const serverName = 'Thingy';
  const serverConfig = {
    type: 'streamable-http',
    url: 'https://thingy.example.com/mcp',
    source: 'yaml',
    headers: { 'X-Conversation-Id': '{{LIBRECHAT_BODY_CONVERSATIONID}}' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMCPServerTools.mockResolvedValue({});
  });

  it('defers connection without failing when body placeholders cannot resolve outside a chat turn', async () => {
    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig,
      userMCPAuthMap: undefined,
    });

    expect(mockGetConnection).not.toHaveBeenCalled();
    expect(mockDiscoverServerTools).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      availableTools: null,
      success: true,
      connectionDeferred: true,
      tools: null,
      oauthRequired: false,
      serverName,
    });
    expect(result.message).toContain('first use in a chat turn');
  });

  it('treats an empty-string body field as missing', async () => {
    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig,
      requestBody: { conversationId: '  ' },
      userMCPAuthMap: undefined,
    });

    expect(mockGetConnection).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('connects normally when the request body provides the placeholder fields', async () => {
    mockGetConnection.mockResolvedValue({
      dispose: jest.fn().mockResolvedValue(undefined),
      fetchTools: jest.fn().mockResolvedValue([]),
    });

    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig,
      requestBody: { conversationId: 'convo-1' },
      userMCPAuthMap: undefined,
    });

    expect(mockGetConnection).toHaveBeenCalledTimes(1);
    expect(result.connectionDeferred).toBeUndefined();
  });

  it('reports missing customUserVars before deferring on body placeholders', async () => {
    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig: {
        ...serverConfig,
        customUserVars: { THINGY_TOKEN: { title: 'Thingy Access Token' } },
      },
      userMCPAuthMap: undefined,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('THINGY_TOKEN');
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
    expect(result.failureReason).toBe('initialization_failed');
    expect(result.message).toBe(`Failed to reinitialize MCP server '${serverName}'`);
  });
});

describe('reinitMCPServer — OAuth attempt lifetime', () => {
  const user = { id: 'user-123' };
  const serverName = 'Thingy';
  const serverConfig = {
    type: 'streamable-http',
    url: 'https://thingy.example.com/mcp',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMCPServerTools.mockResolvedValue({});
  });

  it('returns the expiry supplied when a pending OAuth URL is replayed', async () => {
    const expiresAt = Date.now() + 45_000;
    mockGetConnection.mockImplementation(async ({ oauthStart }) => {
      await oauthStart('https://oauth.example.com/authorize', { expiresAt });
      await oauthStart('https://oauth.example.com/authorize');
      throw new Error('OAuth flow initiated - return early');
    });
    mockDiscoverServerTools.mockResolvedValue({ tools: [], oauthRequired: true, oauthUrl: null });

    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig,
    });

    expect(result).toMatchObject({
      success: true,
      oauthRequired: true,
      oauthUrl: 'https://oauth.example.com/authorize',
      oauthExpiresAt: expiresAt,
    });
  });
});
