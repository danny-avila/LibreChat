const { Constants } = require('librechat-data-provider');

const mockGetConnection = jest.fn();
const mockDiscoverServerTools = jest.fn();
const mockGetGraphApiToken = jest.fn();
const mockUpdateMCPServerTools = jest.fn();
const mockGetMCPAuthorizationIdentity = jest.fn();
const mockGetUserMCPAuthMap = jest.fn();
const mockGetServerConfig = jest.fn();
const mockResolveAllowlists = jest.fn();
const mockResolveCatalogSecurityPolicy = jest.fn();
const mockResolveAllMcpConfigsFresh = jest.fn();
const mockDisconnectUserConnection = jest.fn();
const mockReleaseDetachedUserConnection = jest.fn();
const mockFindUser = jest.fn();
const mockFindPluginAuthsByKeys = jest.fn().mockResolvedValue([]);
const mockMCPAuthorityResolver = {
  bootRevision: { digest: 'test-boot-revision' },
  useIssuedResolution: jest.fn(async (resolution, action) => await action(resolution)),
  bindWithCurrentAuthority: jest.fn(async (resolution, action) => await action(resolution)),
  executeWithCurrentAuthority: jest.fn(async (resolution, action) => await action(resolution)),
  publishWithCurrentAuthority: jest.fn(async (resolution, action) => await action(resolution)),
  resolve: jest.fn(async ({ parsedConfig, schemas }) => ({
    parsedConfig,
    schemas,
    authorityProof: { revision: 'test-proof' },
  })),
};

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
    releaseDetachedUserConnection: mockReleaseDetachedUserConnection,
  })),
  getMCPServersRegistry: jest.fn(() => ({
    getServerConfig: mockGetServerConfig,
    resolveAllowlists: mockResolveAllowlists,
    resolveCatalogSecurityPolicy: mockResolveCatalogSecurityPolicy,
  })),
  getFlowStateManager: jest.fn(() => ({})),
}));
jest.mock('~/models', () => ({
  findUser: (...args) => mockFindUser(...args),
  findToken: jest.fn(),
  findTokens: jest.fn().mockResolvedValue([]),
  createToken: jest.fn(),
  updateToken: jest.fn(),
  deleteTokens: jest.fn(),
  findPluginAuthsByKeys: (...args) => mockFindPluginAuthsByKeys(...args),
}));
jest.mock('~/server/services/MCPAuthority', () => ({
  calculateMCPAuthorityArtifactRevision: jest.fn(() => 'test-artifact'),
  getMCPAuthorityResolver: () => mockMCPAuthorityResolver,
}));
jest.mock('~/server/services/Config', () => ({
  updateMCPServerTools: mockUpdateMCPServerTools,
}));
jest.mock('~/server/services/MCPConfigResolver', () => ({
  resolveAllMcpConfigsFresh: (...args) => mockResolveAllMcpConfigsFresh(...args),
  resolveMCPDiscoveryConfigSnapshot: async (userId, user, options = {}) => {
    const configs = await mockResolveAllMcpConfigsFresh(userId, user);
    return {
      configs: Object.keys(configs).length > 0 ? configs : (options.expectedServerConfigs ?? {}),
      sourceDocuments: [],
      securityPolicy: await mockResolveCatalogSecurityPolicy({
        userId,
        role: user.role,
        tenantId: user.tenantId ?? null,
        refresh: true,
      }),
    };
  },
}));
jest.mock('~/server/services/GraphTokenService', () => ({
  getGraphApiToken: mockGetGraphApiToken,
}));
jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => ({})),
}));

const { reinitMCPServer } = require('./mcp');
const {
  MCP_OBO_CONNECTION_AUTHORIZATION_IDENTITY,
  createMCPConnectionProvenance,
  createMCPToolCatalogScope,
  createMCPToolCatalogSecurityPolicyIdentity,
} = require('@librechat/api');

const originalCredsKey = process.env.CREDS_KEY;
const originalJwtSecret = process.env.JWT_SECRET;

beforeEach(() => {
  process.env.CREDS_KEY = 'mcp-authority-test-key';
  delete process.env.JWT_SECRET;
  mockGetUserMCPAuthMap.mockResolvedValue({});
  mockFindPluginAuthsByKeys.mockResolvedValue([]);
  mockResolveAllMcpConfigsFresh.mockImplementation(async () => {
    const config = await mockGetServerConfig();
    return config ? { Thingy: config } : {};
  });
  mockFindUser.mockImplementation(async ({ _id }) => ({ _id }));
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
    mockResolveCatalogSecurityPolicy.mockResolvedValue({
      allowedDomains: null,
      allowedAddresses: null,
    });
    mockDisconnectUserConnection.mockResolvedValue(undefined);
    mockReleaseDetachedUserConnection.mockResolvedValue(false);
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
    const connection = {
      fetchTools: jest.fn().mockResolvedValue(tools),
      getDiscoveryProvenance: jest.fn().mockReturnValue(provenance),
    };
    mockGetConnection.mockResolvedValue(connection);

    try {
      const result = await reinitMCPServer({ user, serverName, serverConfig: oauthConfig });

      expect(result).toMatchObject({ availableTools: null, tools: null, success: false });
      expect(mockUpdateMCPServerTools).not.toHaveBeenCalled();
      expect(mockDisconnectUserConnection).toHaveBeenCalledWith(
        user.id,
        serverName,
        expect.any(Object),
      );
      expect(mockGetMCPAuthorizationIdentity).toHaveBeenCalledTimes(2);
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
    const connection = {
      fetchTools: jest.fn().mockResolvedValue(tools),
      getDiscoveryProvenance: jest.fn().mockReturnValue(provenance),
    };
    mockGetConnection.mockResolvedValue(connection);

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
      expect(mockReleaseDetachedUserConnection).toHaveBeenCalledWith(
        user.id,
        serverName,
        connection,
      );
    } finally {
      if (originalCredsKey == null) {
        delete process.env.CREDS_KEY;
      } else {
        process.env.CREDS_KEY = originalCredsKey;
      }
    }
  });

  it('accepts a runtime URL auto-OAuth connection with the current stored grant', async () => {
    process.env.CREDS_KEY = 'reinit-runtime-oauth-key';
    const tools = [{ name: 'search', inputSchema: { type: 'object' } }];
    const runtimeConfig = {
      type: 'streamable-http',
      url: 'https://mcp.example.com/users/{{LIBRECHAT_USER_ID}}',
      source: 'yaml',
    };
    const detectedConfig = { ...runtimeConfig, requiresOAuth: true };
    const provenance = createMCPConnectionProvenance(
      {
        tenantId: null,
        userId: user.id,
        serverName,
        serverConfig: detectedConfig,
        effectiveServerConfig: {
          ...detectedConfig,
          url: `https://mcp.example.com/users/${user.id}`,
        },
        securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
          allowedDomains: null,
          allowedAddresses: null,
        }),
        authorizationIdentity: 'grant-runtime',
      },
      'user',
      'oauth',
    );
    mockGetMCPAuthorizationIdentity.mockResolvedValue('grant-runtime');
    mockGetServerConfig.mockResolvedValue(runtimeConfig);
    mockGetConnection.mockResolvedValue({
      fetchTools: jest.fn().mockResolvedValue(tools),
      getDiscoveryProvenance: jest.fn().mockReturnValue(provenance),
    });

    const result = await reinitMCPServer({ user, serverName, serverConfig: runtimeConfig });

    expect(result.tools).toEqual(tools);
    expect(result.discoveryProvenance).toBe(provenance);
    expect(result.authorityScope).toEqual(
      createMCPToolCatalogScope({
        tenantId: null,
        userId: user.id,
        serverName,
        serverConfig: detectedConfig,
        effectiveServerConfig: {
          ...detectedConfig,
          url: `https://mcp.example.com/users/${user.id}`,
        },
        securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
          allowedDomains: null,
          allowedAddresses: null,
        }),
        authorizationIdentity: 'grant-runtime',
      }),
    );
    expect(provenance.authorizationKind).toBe('oauth');
    expect(mockGetMCPAuthorizationIdentity).toHaveBeenCalledTimes(2);
    expect(mockResolveAllMcpConfigsFresh).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ id: user.id, idOnTheSource: null }),
    );
    expect(mockResolveCatalogSecurityPolicy).toHaveBeenCalledWith({
      userId: user.id,
      role: undefined,
      tenantId: null,
      refresh: true,
    });
    expect(mockUpdateMCPServerTools).toHaveBeenCalledWith(
      expect.objectContaining({
        tools,
        authorizationIdentity: 'grant-runtime',
        discoveryProvenance: provenance,
      }),
    );
    expect(mockDisconnectUserConnection).not.toHaveBeenCalled();
  });

  it('accepts OBO lifecycle provenance without querying persistent OAuth grants', async () => {
    process.env.CREDS_KEY = 'reinit-obo-lifecycle-key';
    const tools = [{ name: 'read', inputSchema: { type: 'object' } }];
    const oboConfig = {
      type: 'streamable-http',
      url: 'https://obo.example.com/mcp',
      requiresOAuth: false,
      obo: { scopes: 'api://mcp/.default' },
    };
    const provenance = createMCPConnectionProvenance(
      {
        tenantId: null,
        userId: user.id,
        serverName,
        serverConfig: oboConfig,
        effectiveServerConfig: oboConfig,
        securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
          allowedDomains: null,
          allowedAddresses: null,
        }),
        authorizationIdentity: MCP_OBO_CONNECTION_AUTHORIZATION_IDENTITY,
      },
      'user',
    );
    mockGetServerConfig.mockResolvedValue(oboConfig);
    mockGetConnection.mockResolvedValue({
      fetchTools: jest.fn().mockResolvedValue(tools),
      getDiscoveryProvenance: jest.fn().mockReturnValue(provenance),
    });

    const result = await reinitMCPServer({ user, serverName, serverConfig: oboConfig });

    expect(result.tools).toEqual(tools);
    expect(mockGetMCPAuthorizationIdentity).not.toHaveBeenCalled();
    expect(mockUpdateMCPServerTools).toHaveBeenCalledWith(
      expect.objectContaining({
        tools,
        authorizationIdentity: MCP_OBO_CONNECTION_AUTHORIZATION_IDENTITY,
        discoveryProvenance: provenance,
      }),
    );
  });

  it('does not open a connection when the mandatory bind fence rejects', async () => {
    const config = {
      type: 'streamable-http',
      url: 'https://thingy.example.com/mcp',
    };
    mockGetServerConfig.mockResolvedValue(config);
    mockMCPAuthorityResolver.useIssuedResolution.mockRejectedValueOnce(
      new Error('authority revoked'),
    );

    const result = await reinitMCPServer({ user, serverName, serverConfig: config });

    expect(result).toMatchObject({ success: false, failureReason: 'initialization_failed' });
    expect(mockGetConnection).not.toHaveBeenCalled();
  });

  it('does not start unauthenticated discovery when its bind fence rejects', async () => {
    const config = {
      type: 'streamable-http',
      url: 'https://thingy.example.com/mcp',
    };
    mockGetServerConfig.mockResolvedValue(config);
    mockGetConnection.mockRejectedValueOnce(new Error('OAuth authentication required'));
    mockMCPAuthorityResolver.useIssuedResolution
      .mockImplementationOnce(async (resolution, action) => await action(resolution))
      .mockRejectedValueOnce(new Error('authority revoked before discovery'));

    const result = await reinitMCPServer({ user, serverName, serverConfig: config });

    expect(result).toMatchObject({ success: false, failureReason: 'oauth_required' });
    expect(mockDiscoverServerTools).not.toHaveBeenCalled();
    expect(mockUpdateMCPServerTools).not.toHaveBeenCalled();
  });

  it('does not fetch tools when the execution fence rejects after connection binding', async () => {
    const config = {
      type: 'streamable-http',
      url: 'https://thingy.example.com/mcp',
    };
    const fetchTools = jest.fn().mockResolvedValue([]);
    mockGetServerConfig.mockResolvedValue(config);
    mockGetConnection.mockResolvedValue({ fetchTools });
    mockMCPAuthorityResolver.useIssuedResolution
      .mockImplementationOnce(async (resolution, action) => await action(resolution))
      .mockRejectedValueOnce(new Error('authority revoked before fetch'));

    await reinitMCPServer({ user, serverName, serverConfig: config });

    expect(fetchTools).not.toHaveBeenCalled();
    expect(mockUpdateMCPServerTools).not.toHaveBeenCalled();
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
    expect(mockDisconnectUserConnection).toHaveBeenCalledWith(
      user.id,
      serverName,
      expect.any(Object),
    );
  });

  it('rejects live tools when the authoritative server config rotates after discovery', async () => {
    process.env.CREDS_KEY = 'reinit-config-rotation-key';
    const tools = [{ name: 'search', inputSchema: { type: 'object' } }];
    const initialConfig = {
      type: 'streamable-http',
      url: 'https://old.example.com/mcp',
      source: 'yaml',
    };
    const currentConfig = { ...initialConfig, url: 'https://new.example.com/mcp' };
    const provenance = createMCPConnectionProvenance(
      {
        tenantId: null,
        userId: user.id,
        serverName,
        serverConfig: initialConfig,
        effectiveServerConfig: initialConfig,
        securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
          allowedDomains: null,
          allowedAddresses: null,
        }),
        authorizationIdentity: 'none',
      },
      'user',
    );
    mockGetServerConfig.mockResolvedValue(currentConfig);
    mockGetConnection.mockResolvedValue({
      fetchTools: jest.fn().mockResolvedValue(tools),
      getDiscoveryProvenance: jest.fn().mockReturnValue(provenance),
    });

    const result = await reinitMCPServer({ user, serverName, serverConfig: initialConfig });

    expect(result).toMatchObject({ availableTools: null, tools: null, success: false });
    expect(mockUpdateMCPServerTools).not.toHaveBeenCalled();
    expect(mockDisconnectUserConnection).toHaveBeenCalledWith(
      user.id,
      serverName,
      expect.any(Object),
    );
  });

  it('rejects live tools when the authoritative policy rotates after discovery', async () => {
    process.env.CREDS_KEY = 'reinit-policy-rotation-key';
    const tools = [{ name: 'search', inputSchema: { type: 'object' } }];
    const config = {
      type: 'streamable-http',
      url: 'https://thingy.example.com/mcp',
      source: 'yaml',
    };
    const provenance = createMCPConnectionProvenance(
      {
        tenantId: null,
        userId: user.id,
        serverName,
        serverConfig: config,
        effectiveServerConfig: config,
        securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
          allowedDomains: ['thingy.example.com'],
          allowedAddresses: null,
        }),
        authorizationIdentity: 'none',
      },
      'user',
    );
    mockGetServerConfig.mockResolvedValue(config);
    mockResolveCatalogSecurityPolicy.mockResolvedValue({
      allowedDomains: ['new.example.com'],
      allowedAddresses: null,
    });
    mockGetConnection.mockResolvedValue({
      fetchTools: jest.fn().mockResolvedValue(tools),
      getDiscoveryProvenance: jest.fn().mockReturnValue(provenance),
    });

    const result = await reinitMCPServer({ user, serverName, serverConfig: config });

    expect(result).toMatchObject({ availableTools: null, tools: null, success: false });
    expect(mockUpdateMCPServerTools).not.toHaveBeenCalled();
  });

  it.each([
    ['deleted', null],
    ['role changed', { _id: user.id, role: 'ADMIN' }],
    ['source identity changed', { _id: user.id, role: 'USER', idOnTheSource: 'source-b' }],
  ])('rejects live tools when the authoritative user is %s', async (_label, storedUser) => {
    process.env.CREDS_KEY = 'reinit-principal-rotation-key';
    const scopedUser = { ...user, role: 'USER', idOnTheSource: 'source-a' };
    const config = {
      type: 'streamable-http',
      url: 'https://thingy.example.com/mcp',
      source: 'yaml',
    };
    const tools = [{ name: 'search', inputSchema: { type: 'object' } }];
    mockFindUser.mockResolvedValue(storedUser);
    mockGetServerConfig.mockResolvedValue(config);
    mockGetConnection.mockResolvedValue({
      fetchTools: jest.fn().mockResolvedValue(tools),
      getDiscoveryProvenance: jest.fn().mockReturnValue({ version: 1 }),
    });

    const result = await reinitMCPServer({ user: scopedUser, serverName, serverConfig: config });

    expect(result).toMatchObject({ availableTools: null, tools: null, success: false });
    expect(mockResolveAllMcpConfigsFresh).not.toHaveBeenCalled();
    expect(mockUpdateMCPServerTools).not.toHaveBeenCalled();
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
    mockGetUserMCPAuthMap.mockResolvedValue({
      [`${Constants.mcp_prefix}${serverName}`]: { THINGY_TOKEN: '' },
    });

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
    mockGetUserMCPAuthMap.mockResolvedValue({
      [`${Constants.mcp_prefix}${serverName}`]: { THINGY_TOKEN: 'secret-token' },
    });
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
    const currentConfig = { type: 'streamable-http', url: 'https://thingy.example.com/mcp' };
    mockGetServerConfig.mockResolvedValue(currentConfig);
    const provenance = createMCPConnectionProvenance(
      {
        tenantId: null,
        userId: user.id,
        serverName,
        serverConfig: currentConfig,
        effectiveServerConfig: currentConfig,
        securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
          allowedDomains: null,
          allowedAddresses: null,
        }),
        authorizationIdentity: 'none',
        authorizationKind: 'none',
      },
      'user',
      'none',
    );
    mockGetConnection.mockResolvedValue({
      fetchTools: jest.fn().mockResolvedValue([]),
      getDiscoveryProvenance: jest.fn().mockReturnValue(provenance),
    });

    await reinitMCPServer({
      user,
      serverName,
      serverConfig: currentConfig,
      userMCPAuthMap: undefined,
    });

    expect(mockUpdateMCPServerTools).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        serverName,
        tools: [],
        serverConfig: currentConfig,
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
    const currentConfig = { type: 'streamable-http', url: 'https://thingy.example.com/mcp' };
    const detectedConfig = { ...currentConfig, requiresOAuth: true };
    const provenance = createMCPConnectionProvenance(
      {
        tenantId: null,
        userId: user.id,
        serverName,
        serverConfig: detectedConfig,
        effectiveServerConfig: detectedConfig,
        securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
          allowedDomains: null,
          allowedAddresses: null,
        }),
        authorizationIdentity: 'none',
        authorizationKind: 'oauth',
      },
      'user',
      'oauth',
    );
    mockGetServerConfig.mockResolvedValue(currentConfig);
    mockGetConnection.mockRejectedValue(new Error('OAuth authentication required'));
    mockDiscoverServerTools.mockResolvedValue({
      tools: [],
      oauthRequired: true,
      oauthUrl: null,
      provenance,
    });
    const requestBody = { conversationId: 'conv-456', messageId: 'msg-456' };

    const result = await reinitMCPServer({
      user,
      serverName,
      serverConfig: currentConfig,
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
    mockGetServerConfig.mockResolvedValue(serverConfig);
    const effectiveServerConfig = {
      ...serverConfig,
      url: 'https://thingy.example.com/messages/msg-789/mcp',
    };
    const provenance = createMCPConnectionProvenance(
      {
        tenantId: null,
        userId: user.id,
        serverName,
        serverConfig,
        effectiveServerConfig,
        securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
          allowedDomains: null,
          allowedAddresses: null,
        }),
        authorizationIdentity: 'none',
        authorizationKind: 'none',
      },
      'user',
      'none',
    );
    mockGetConnection.mockResolvedValue({
      disconnect,
      fetchTools: jest.fn().mockResolvedValue(tools),
      getDiscoveryProvenance: jest.fn().mockReturnValue(provenance),
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
    mockGetServerConfig.mockResolvedValue(undefined);
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
    mockGetServerConfig.mockResolvedValue(serverConfig);
    mockGetMCPAuthorizationIdentity.mockResolvedValue('oauth-attempt-grant');
  });

  it('returns the expiry supplied when a pending OAuth URL is replayed', async () => {
    const expiresAt = Date.now() + 45_000;
    const detectedConfig = { ...serverConfig, requiresOAuth: true };
    const provenance = createMCPConnectionProvenance(
      {
        tenantId: null,
        userId: user.id,
        serverName,
        serverConfig: detectedConfig,
        effectiveServerConfig: detectedConfig,
        securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
          allowedDomains: null,
          allowedAddresses: null,
        }),
        authorizationIdentity: 'oauth-attempt-grant',
        authorizationKind: 'oauth',
      },
      'user',
      'oauth',
    );
    mockGetConnection.mockImplementation(async ({ oauthStart }) => {
      await oauthStart('https://oauth.example.com/authorize', { expiresAt });
      await oauthStart('https://oauth.example.com/authorize');
      throw new Error('OAuth flow initiated - return early');
    });
    mockDiscoverServerTools.mockResolvedValue({
      tools: [],
      oauthRequired: true,
      oauthUrl: null,
      provenance,
    });

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
