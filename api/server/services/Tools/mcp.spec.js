const { Constants } = require('librechat-data-provider');

const mockGetConnection = jest.fn();
const mockDiscoverServerTools = jest.fn();
const mockGetGraphApiToken = jest.fn();
const mockUpdateMCPServerTools = jest.fn();
const mockGetMCPAuthorizationIdentity = jest.fn();
const mockGetUserMCPAuthMap = jest.fn();
const mockGetServerConfig = jest.fn();
const mockResolveAllowlists = jest.fn();
const mockDisconnectUserConnection = jest.fn();

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  getMCPAuthorizationIdentity: (...args) => mockGetMCPAuthorizationIdentity(...args),
  getUserMCPAuthMap: (...args) => mockGetUserMCPAuthMap(...args),
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(() => ({
    getConnection: mockGetConnection,
    discoverServerTools: mockDiscoverServerTools,
    disconnectUserConnection: mockDisconnectUserConnection,
  })),
  getMCPServersRegistry: jest.fn(() => ({
    getServerConfig: mockGetServerConfig,
    resolveAllowlists: mockResolveAllowlists,
  })),
  getFlowStateManager: jest.fn(() => ({})),
}));
jest.mock('~/models', () => ({
  findToken: jest.fn(),
  findTokens: jest.fn(),
  createToken: jest.fn(),
  updateToken: jest.fn(),
  deleteTokens: jest.fn(),
  findPluginAuthsByKeys: jest.fn(),
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
const {
  createMCPConnectionProvenance,
  createMCPToolCatalogSecurityPolicyIdentity,
} = require('@librechat/api');

const originalCredsKey = process.env.CREDS_KEY;
const originalJwtSecret = process.env.JWT_SECRET;

beforeEach(() => {
  delete process.env.CREDS_KEY;
  delete process.env.JWT_SECRET;
});

afterAll(() => {
  if (originalCredsKey == null) {
    delete process.env.CREDS_KEY;
  } else {
    process.env.CREDS_KEY = originalCredsKey;
  }
  if (originalJwtSecret == null) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

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
    mockGetMCPAuthorizationIdentity.mockResolvedValue('none');
    mockGetServerConfig.mockResolvedValue(undefined);
    mockResolveAllowlists.mockResolvedValue({
      allowedDomains: null,
      allowedAddresses: null,
      useSSRFProtection: false,
    });
    mockDisconnectUserConnection.mockResolvedValue(undefined);
  });

  it('rejects live tools when a stale connection grant differs from the current grant', async () => {
    const originalCredsKey = process.env.CREDS_KEY;
    process.env.CREDS_KEY = 'reinit-stale-grant-key';
    const tools = [{ name: 'search', inputSchema: { type: 'object' } }];
    const oauthConfig = {
      type: 'streamable-http',
      url: 'https://thingy.example.com/mcp',
      requiresOAuth: true,
    };
    const provenance = createMCPConnectionProvenance(
      {
        tenantId: null,
        userId: user.id,
        serverName,
        serverConfig: oauthConfig,
        effectiveServerConfig: oauthConfig,
        securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
          allowedDomains: null,
          allowedAddresses: null,
        }),
        authorizationIdentity: 'grant-a',
      },
      'user',
    );
    mockGetMCPAuthorizationIdentity.mockResolvedValue('grant-b');
    mockGetServerConfig.mockResolvedValue(oauthConfig);
    mockGetConnection.mockResolvedValue({
      fetchTools: jest.fn().mockResolvedValue(tools),
      getDiscoveryProvenance: jest.fn().mockReturnValue(provenance),
    });

    try {
      const result = await reinitMCPServer({ user, serverName, serverConfig: oauthConfig });

      expect(result).toMatchObject({ availableTools: null, tools: null, success: false });
      expect(mockUpdateMCPServerTools).not.toHaveBeenCalled();
      expect(mockDisconnectUserConnection).toHaveBeenCalledWith(user.id, serverName);
      expect(mockGetMCPAuthorizationIdentity).toHaveBeenCalledTimes(1);
    } finally {
      if (originalCredsKey == null) {
        delete process.env.CREDS_KEY;
      } else {
        process.env.CREDS_KEY = originalCredsKey;
      }
    }
  });

  it('accepts a newly authorized connection whose provenance matches the current grant', async () => {
    const originalCredsKey = process.env.CREDS_KEY;
    process.env.CREDS_KEY = 'reinit-current-grant-key';
    const tools = [{ name: 'search', inputSchema: { type: 'object' } }];
    const oauthConfig = {
      type: 'streamable-http',
      url: 'https://thingy.example.com/mcp',
      requiresOAuth: true,
    };
    const provenance = createMCPConnectionProvenance(
      {
        tenantId: null,
        userId: user.id,
        serverName,
        serverConfig: oauthConfig,
        effectiveServerConfig: oauthConfig,
        securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
          allowedDomains: null,
          allowedAddresses: null,
        }),
        authorizationIdentity: 'grant-b',
      },
      'user',
    );
    mockGetMCPAuthorizationIdentity.mockResolvedValue('grant-b');
    mockGetServerConfig.mockResolvedValue(oauthConfig);
    mockGetConnection.mockResolvedValue({
      fetchTools: jest.fn().mockResolvedValue(tools),
      getDiscoveryProvenance: jest.fn().mockReturnValue(provenance),
    });

    try {
      const result = await reinitMCPServer({ user, serverName, serverConfig: oauthConfig });

      expect(result.tools).toEqual(tools);
      expect(mockUpdateMCPServerTools).toHaveBeenCalledWith(
        expect.objectContaining({
          tools,
          authorizationIdentity: 'grant-b',
          persistCatalog: true,
          discoveryProvenance: provenance,
        }),
      );
      expect(mockDisconnectUserConnection).not.toHaveBeenCalled();
    } finally {
      if (originalCredsKey == null) {
        delete process.env.CREDS_KEY;
      } else {
        process.env.CREDS_KEY = originalCredsKey;
      }
    }
  });

  it('rejects live tools when custom credentials rotate after connection discovery', async () => {
    process.env.CREDS_KEY = 'reinit-custom-credential-key';
    const tools = [{ name: 'search', inputSchema: { type: 'object' } }];
    const customConfig = {
      ...serverConfig,
      source: 'yaml',
    };
    const oldCustomUserVars = { THINGY_TOKEN: 'old-token' };
    const provenance = createMCPConnectionProvenance(
      {
        tenantId: null,
        userId: user.id,
        serverName,
        serverConfig: customConfig,
        effectiveServerConfig: customConfig,
        securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
          allowedDomains: null,
          allowedAddresses: null,
        }),
        customUserVars: oldCustomUserVars,
        authorizationIdentity: 'none',
      },
      'user',
    );
    mockGetServerConfig.mockResolvedValue(customConfig);
    mockGetUserMCPAuthMap.mockResolvedValue({
      [`${Constants.mcp_prefix}${serverName}`]: { THINGY_TOKEN: 'new-token' },
    });
    mockGetConnection.mockResolvedValue({
      fetchTools: jest.fn().mockResolvedValue(tools),
      getDiscoveryProvenance: jest.fn().mockReturnValue(provenance),
    });

    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig: customConfig,
      userMCPAuthMap: {
        [`${Constants.mcp_prefix}${serverName}`]: oldCustomUserVars,
      },
    });

    expect(result).toMatchObject({ availableTools: null, tools: null, success: false });
    expect(mockGetUserMCPAuthMap).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, servers: [serverName] }),
    );
    expect(mockUpdateMCPServerTools).not.toHaveBeenCalled();
    expect(mockDisconnectUserConnection).toHaveBeenCalledWith(user.id, serverName);
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

    expect(mockUpdateMCPServerTools).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        serverName,
        tools: [],
        serverConfig: { type: 'streamable-http', url: 'https://thingy.example.com/mcp' },
      }),
    );
    expect(mockGetMCPAuthorizationIdentity).not.toHaveBeenCalled();
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
    expect(mockUpdateMCPServerTools).toHaveBeenCalledWith(
      expect.objectContaining({ tools: [], persistCatalog: true }),
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
    const disconnect = jest.fn().mockResolvedValue(undefined);
    mockGetConnection.mockResolvedValue({
      disconnect,
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
