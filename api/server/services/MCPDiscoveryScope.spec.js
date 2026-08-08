const { Types } = require('mongoose');

const mockFindUser = jest.fn();
const mockFindTokens = jest.fn().mockResolvedValue([]);
const mockFindPluginAuthsByKeys = jest.fn();
const mockResolveMCPDiscoveryConfigSnapshot = jest.fn();
const mockGetGraphApiToken = jest.fn();
const mockResolveAuthority = jest.fn();
const mockUseIssuedResolution = jest.fn(async (resolution, action) => await action(resolution));
let mockObservedCredentialRows;

const mockGetUserMCPAuthMap = jest.fn(async ({ userId, servers, findPluginAuthsByKeys }) => {
  const pluginKey = `mcp_${servers[0]}`;
  const rows = await findPluginAuthsByKeys({ userId, pluginKeys: [pluginKey] });
  mockObservedCredentialRows = rows;
  return {
    [pluginKey]: Object.fromEntries(rows.map(({ authField, value }) => [authField, value])),
  };
});

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  getUserMCPAuthMap: mockGetUserMCPAuthMap,
}));

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  getTenantId: jest.fn(),
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('~/models', () => ({
  findMCPServerByObjectId: jest.fn(),
  findPluginAuthsByKeys: mockFindPluginAuthsByKeys,
  findToken: jest.fn(),
  findTokens: mockFindTokens,
  findUser: mockFindUser,
}));

jest.mock('~/server/services/GraphTokenService', () => ({
  getGraphApiToken: mockGetGraphApiToken,
}));

jest.mock('~/server/services/MCPConfigResolver', () => ({
  resolveMCPDiscoveryConfigSnapshot: mockResolveMCPDiscoveryConfigSnapshot,
}));

jest.mock('~/server/services/MCPAuthority', () => ({
  calculateMCPAuthorityArtifactRevision: jest.fn(),
  getMCPAuthorityResolver: () => ({
    bootRevision: { digest: 'boot-digest' },
    resolve: mockResolveAuthority,
    useIssuedResolution: mockUseIssuedResolution,
  }),
}));

const {
  createMCPRefreshAuthorityLifecycle,
  resolveCurrentMCPPrincipal,
  resolveCurrentMCPToolAuthority,
} = require('./MCPDiscoveryScope');

describe('MCPDiscoveryScope', () => {
  const userId = new Types.ObjectId().toString();
  const federatedTokens = {
    access_token: 'openid-access-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
  const storedUser = {
    _id: new Types.ObjectId(userId),
    email: 'user@example.com',
    openidId: 'openid-subject',
    provider: 'openid',
    role: 'USER',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockObservedCredentialRows = undefined;
    mockFindTokens.mockResolvedValue([]);
    mockFindUser.mockResolvedValue(storedUser);
    mockResolveAuthority.mockImplementation(async ({ parsedConfig, schemas }) => ({
      parsedConfig,
      schemas,
      authorityProof: { revision: 'proof-revision' },
    }));
  });

  it('preserves only cloned transient federated tokens after validating the stored principal', async () => {
    const result = await resolveCurrentMCPPrincipal(
      { id: userId, role: 'USER', federatedTokens },
      'graph-server',
    );

    expect(result).toEqual(expect.objectContaining({ id: userId, federatedTokens }));
    expect(result.federatedTokens).not.toBe(federatedTokens);
  });

  it('resolves Graph runtime config and ignores stale undeclared credential rows', async () => {
    const serverName = 'graph-server';
    const serverConfig = {
      type: 'streamable-http',
      url: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}' },
      customUserVars: { API_KEY: { title: 'API key' } },
    };
    const currentCredential = {
      _id: new Types.ObjectId(),
      pluginKey: `mcp_${serverName}`,
      authField: 'API_KEY',
      value: 'current-key',
    };
    const staleCredential = {
      _id: new Types.ObjectId(),
      pluginKey: `mcp_${serverName}`,
      authField: 'REMOVED_KEY',
      value: 'stale-key',
    };
    mockFindPluginAuthsByKeys.mockResolvedValue([currentCredential, staleCredential]);
    mockGetGraphApiToken.mockImplementation(async (user, accessToken) => ({
      access_token: `${user.id}:${accessToken}:graph`,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'graph',
    }));
    mockResolveMCPDiscoveryConfigSnapshot.mockResolvedValue({
      configs: { [serverName]: serverConfig },
      pendingConfigs: {},
      sourceDocuments: [],
      securityPolicy: { allowedDomains: null, allowedAddresses: null },
      collisionServerNames: [serverName],
      missingConfigServerNames: [],
    });

    const result = await resolveCurrentMCPToolAuthority({
      user: { id: userId, role: 'USER', federatedTokens },
      serverName,
    });

    expect(result.parsedConfig.effectiveConfig.headers.Authorization).toBe(
      `Bearer ${userId}:openid-access-token:graph`,
    );
    expect(mockGetGraphApiToken).toHaveBeenCalledWith(
      expect.objectContaining({ id: userId, federatedTokens }),
      'openid-access-token',
      expect.any(String),
      true,
    );
    expect(mockObservedCredentialRows).toEqual([currentCredential]);
    const { createMCPAuthorityCredentialRevision } = require('@librechat/data-schemas');
    expect(mockResolveAuthority).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          expect.objectContaining({
            credentialFields: ['API_KEY'],
            expectedCredentialRevision: createMCPAuthorityCredentialRevision(
              ['API_KEY'],
              [currentCredential],
            ),
          }),
        ],
      }),
    );
  });

  it('keeps runtime-detected OAuth out of the declarative source config', async () => {
    const serverName = 'runtime-oauth-server';
    const serverConfig = {
      type: 'streamable-http',
      url: 'https://mcp.example.com/users/{{LIBRECHAT_USER_ID}}',
      source: 'yaml',
    };
    mockFindPluginAuthsByKeys.mockResolvedValue([]);
    mockResolveMCPDiscoveryConfigSnapshot.mockResolvedValue({
      configs: { [serverName]: serverConfig },
      pendingConfigs: {},
      sourceDocuments: [],
      securityPolicy: { allowedDomains: null, allowedAddresses: null },
      collisionServerNames: [serverName],
      missingConfigServerNames: [],
    });

    const result = await resolveCurrentMCPToolAuthority({
      user: { id: userId, role: 'USER' },
      serverName,
      oauthRequiredHint: true,
      allowMissingAuthorization: true,
    });

    expect(result.parsedConfig.sourceConfig).toEqual(serverConfig);
    expect(result.parsedConfig.effectiveConfig).toEqual({
      ...serverConfig,
      requiresOAuth: true,
      url: `https://mcp.example.com/users/${userId}`,
    });
    expect(result.parsedConfig.authorization).toEqual(
      expect.objectContaining({ kind: 'oauth', identity: 'none' }),
    );
    expect(mockResolveAuthority).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          expect.objectContaining({ resolvedConfig: { ...serverConfig, requiresOAuth: true } }),
        ],
      }),
    );
  });

  it('preserves runtime OAuth activation across Graph credential materialization', async () => {
    const serverName = 'runtime-oauth-graph-server';
    const serverConfig = {
      type: 'streamable-http',
      url: 'https://mcp.example.com/users/{{LIBRECHAT_USER_ID}}',
      headers: { Authorization: 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}' },
      source: 'yaml',
    };
    mockFindPluginAuthsByKeys.mockResolvedValue([]);
    mockGetGraphApiToken.mockResolvedValue({
      access_token: 'materialized-graph-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'graph',
    });
    mockResolveMCPDiscoveryConfigSnapshot.mockResolvedValue({
      configs: { [serverName]: serverConfig },
      pendingConfigs: {},
      sourceDocuments: [],
      securityPolicy: { allowedDomains: null, allowedAddresses: null },
      collisionServerNames: [serverName],
      missingConfigServerNames: [],
    });

    const result = await resolveCurrentMCPToolAuthority({
      user: { id: userId, role: 'USER', federatedTokens },
      serverName,
      oauthRequiredHint: true,
      allowMissingAuthorization: true,
    });

    expect(result.parsedConfig.sourceConfig).toEqual(serverConfig);
    expect(result.parsedConfig.effectiveConfig).toEqual({
      ...serverConfig,
      requiresOAuth: true,
      url: `https://mcp.example.com/users/${userId}`,
      headers: { Authorization: 'Bearer materialized-graph-token' },
    });
    expect(result.parsedConfig.authorization.kind).toBe('oauth');
  });

  it('revalidates a refreshed OAuth generation before accepting it', async () => {
    const serverName = 'refresh-server';
    const serverConfig = {
      type: 'streamable-http',
      url: 'https://mcp.example.com',
      requiresOAuth: true,
      source: 'yaml',
    };
    const oauthRecords = (generation) => [
      {
        _id: new Types.ObjectId(),
        type: 'mcp_oauth_client',
        identifier: `mcp:${serverName}:client`,
        metadata: { credential_set_id: generation },
      },
    ];
    mockFindPluginAuthsByKeys.mockResolvedValue([]);
    mockResolveMCPDiscoveryConfigSnapshot.mockResolvedValue({
      configs: { [serverName]: serverConfig },
      pendingConfigs: {},
      sourceDocuments: [],
      securityPolicy: { allowedDomains: null, allowedAddresses: null },
      collisionServerNames: [serverName],
      missingConfigServerNames: [],
    });
    mockFindTokens.mockResolvedValue(oauthRecords('generation-before-refresh'));
    const authority = await resolveCurrentMCPToolAuthority({
      user: { id: userId, role: 'USER' },
      serverName,
      oauthRequiredHint: true,
    });
    mockFindTokens.mockResolvedValue(oauthRecords('generation-after-refresh'));
    const lifecycle = createMCPRefreshAuthorityLifecycle({ authority });
    const exchange = jest.fn().mockResolvedValue({ access_token: 'new-token' });
    const store = jest.fn().mockResolvedValue({
      access_token: 'new-token',
      credential_set_id: 'generation-after-refresh',
    });

    await expect(lifecycle.exchange(exchange)).resolves.toEqual({ access_token: 'new-token' });
    await expect(lifecycle.store({ access_token: 'new-token' }, store)).resolves.toEqual(
      expect.objectContaining({ credential_set_id: 'generation-after-refresh' }),
    );
    await expect(
      lifecycle.accept({
        access_token: 'new-token',
        credential_set_id: 'generation-after-refresh',
      }),
    ).resolves.toBeUndefined();

    expect(exchange).toHaveBeenCalledTimes(1);
    expect(store).toHaveBeenCalledTimes(1);
    expect(mockUseIssuedResolution).toHaveBeenCalledTimes(3);
  });

  it('rejects a refreshed OAuth generation that is not current', async () => {
    const serverName = 'stale-refresh-server';
    const serverConfig = {
      type: 'streamable-http',
      url: 'https://mcp.example.com',
      requiresOAuth: true,
      source: 'yaml',
    };
    mockFindPluginAuthsByKeys.mockResolvedValue([]);
    mockResolveMCPDiscoveryConfigSnapshot.mockResolvedValue({
      configs: { [serverName]: serverConfig },
      pendingConfigs: {},
      sourceDocuments: [],
      securityPolicy: { allowedDomains: null, allowedAddresses: null },
      collisionServerNames: [serverName],
      missingConfigServerNames: [],
    });
    mockFindTokens.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        type: 'mcp_oauth_client',
        identifier: `mcp:${serverName}:client`,
        metadata: { credential_set_id: 'current-generation' },
      },
    ]);
    const authority = await resolveCurrentMCPToolAuthority({
      user: { id: userId, role: 'USER' },
      serverName,
      oauthRequiredHint: true,
    });
    const lifecycle = createMCPRefreshAuthorityLifecycle({ authority });

    await expect(
      lifecycle.accept({ access_token: 'rejected-token', credential_set_id: 'other-generation' }),
    ).rejects.toThrow('MCP authority changed after refreshed credentials were stored');
  });

  it('rejects refreshed credentials when effective user configuration changes', async () => {
    const serverName = 'credential-drift-refresh-server';
    const serverConfig = {
      type: 'streamable-http',
      url: 'https://mcp.example.com',
      requiresOAuth: true,
      source: 'yaml',
      headers: { 'X-API-Key': '{{API_KEY}}' },
      customUserVars: { API_KEY: { title: 'API key' } },
    };
    const credential = (value) => ({
      _id: new Types.ObjectId(),
      pluginKey: `mcp_${serverName}`,
      authField: 'API_KEY',
      value,
    });
    mockResolveMCPDiscoveryConfigSnapshot.mockResolvedValue({
      configs: { [serverName]: serverConfig },
      pendingConfigs: {},
      sourceDocuments: [],
      securityPolicy: { allowedDomains: null, allowedAddresses: null },
      collisionServerNames: [serverName],
      missingConfigServerNames: [],
    });
    mockFindTokens.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        type: 'mcp_oauth_client',
        identifier: `mcp:${serverName}:client`,
        metadata: { credential_set_id: 'current-generation' },
      },
    ]);
    mockFindPluginAuthsByKeys.mockResolvedValue([credential('old-key')]);
    const authority = await resolveCurrentMCPToolAuthority({
      user: { id: userId, role: 'USER' },
      serverName,
      oauthRequiredHint: true,
    });
    mockFindPluginAuthsByKeys.mockResolvedValue([credential('new-key')]);
    const lifecycle = createMCPRefreshAuthorityLifecycle({ authority });

    await expect(
      lifecycle.accept({
        access_token: 'rejected-token',
        credential_set_id: 'current-generation',
      }),
    ).rejects.toThrow('MCP authority changed after refreshed credentials were stored');
  });
});
