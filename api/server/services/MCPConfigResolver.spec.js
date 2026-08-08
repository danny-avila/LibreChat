const mockGetAppConfig = jest.fn();
const mockGetMCPAppConfigSnapshot = jest.fn();
const mockEnsureConfigServers = jest.fn();
const mockGetAllServerConfigsFresh = jest.fn();
const mockResolveAllowlists = jest.fn();
const mockGetUserServerConfigFresh = jest.fn();
const mockGetAccessibleUserServerNamesFresh = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  getTenantId: jest.fn().mockReturnValue(undefined),
  logger: { warn: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  MCP_AUTHORITY_IDENTITY_KEY: '__mcpAuthorityIdentity',
  getAppConfigOptionsFromUser: (user, tenantId) => ({
    userId: user?.id,
    role: user?.role,
    idOnTheSource: user?.idOnTheSource,
    tenantId,
  }),
  getMCPToolCatalogRevision: (config) =>
    JSON.stringify({ type: config.type, url: config.url, command: config.command }),
  normalizeServerName: (serverName) => serverName.replace(/[^a-zA-Z0-9_.-]/g, '_'),
}));

jest.mock('~/config', () => ({
  getMCPServersRegistry: () => ({
    ensureConfigServers: mockEnsureConfigServers,
    getAllServerConfigsFresh: mockGetAllServerConfigsFresh,
    getUserServerConfigFresh: mockGetUserServerConfigFresh,
    getAccessibleUserServerNamesFresh: mockGetAccessibleUserServerNamesFresh,
    resolveAllowlists: mockResolveAllowlists,
  }),
}));

jest.mock('./Config', () => ({
  getAppConfig: mockGetAppConfig,
  getMCPAppConfigSnapshot: mockGetMCPAppConfigSnapshot,
}));

const { resolveMCPDiscoveryConfigSnapshot } = require('./MCPConfigResolver');

describe('MCPConfigResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives strict configs and policy from one authoritative app snapshot', async () => {
    const user = {
      id: 'user-1',
      role: 'ADMIN',
      tenantId: 'tenant-a',
      idOnTheSource: 'source-1',
    };
    const rawConfig = { type: 'streamable-http', url: 'https://mcp.example.com' };
    const parsedConfig = { ...rawConfig, source: 'yaml' };
    const securityPolicy = {
      allowedDomains: ['mcp.example.com'],
      allowedAddresses: ['10.0.0.0/8'],
    };
    const sourceDocuments = [{ _id: 'config-a', updatedAt: '2026-08-07T00:00:00.000Z' }];
    mockGetMCPAppConfigSnapshot.mockResolvedValue({
      config: {
        mcpConfig: { search: rawConfig },
        mcpSettings: securityPolicy,
      },
      sourceDocuments,
    });
    mockEnsureConfigServers.mockResolvedValue({ search: parsedConfig });
    mockGetAllServerConfigsFresh.mockResolvedValue({ search: parsedConfig });

    await expect(resolveMCPDiscoveryConfigSnapshot(user.id, user)).resolves.toEqual({
      collisionServerNames: ['search'],
      configs: { search: parsedConfig },
      missingConfigServerNames: [],
      securityPolicy,
      sourceDocuments,
    });

    expect(mockGetMCPAppConfigSnapshot).toHaveBeenCalledTimes(1);
    expect(mockGetMCPAppConfigSnapshot).toHaveBeenCalledWith({
      userId: user.id,
      role: user.role,
      idOnTheSource: user.idOnTheSource,
      tenantId: user.tenantId,
      failClosed: true,
    });
    expect(mockEnsureConfigServers).toHaveBeenCalledWith(
      { search: rawConfig },
      { failClosed: true, allowlists: securityPolicy },
    );
    expect(mockGetAllServerConfigsFresh).toHaveBeenCalledWith(
      user.id,
      { search: parsedConfig },
      user.role,
    );
    expect(mockResolveAllowlists).not.toHaveBeenCalled();
  });

  it('uses cache-only Config resolution for authority validation', async () => {
    const user = { id: 'user-1', role: 'USER', tenantId: 'tenant-a' };
    const rawConfig = { type: 'streamable-http', url: 'https://mcp.example.com' };
    const securityPolicy = { allowedDomains: ['mcp.example.com'], allowedAddresses: null };
    mockGetMCPAppConfigSnapshot.mockResolvedValue({
      config: {
        mcpConfig: { search: rawConfig },
        mcpSettings: securityPolicy,
      },
      sourceDocuments: [],
    });
    mockEnsureConfigServers.mockResolvedValue({});
    mockGetAllServerConfigsFresh.mockResolvedValue({});

    await resolveMCPDiscoveryConfigSnapshot(user.id, user, { initializeMissing: false });

    expect(mockEnsureConfigServers).toHaveBeenCalledWith(
      { search: rawConfig },
      { failClosed: true, initializeMissing: false, allowlists: securityPolicy },
    );
  });

  it('restricts cache-only validation to the requested server', async () => {
    const user = { id: 'user-1', role: 'USER', tenantId: 'tenant-a' };
    const requested = { type: 'streamable-http', url: 'https://requested.example.com' };
    const unrelated = { type: 'streamable-http', url: 'https://cold.example.com' };
    mockGetMCPAppConfigSnapshot.mockResolvedValue({
      config: { mcpConfig: { 'Requested: Server': requested, cold: unrelated } },
      sourceDocuments: [],
    });
    mockEnsureConfigServers.mockResolvedValue({
      'Requested: Server': { ...requested, source: 'config' },
    });
    mockGetAllServerConfigsFresh.mockResolvedValue({
      'Requested: Server': { ...requested, source: 'config' },
      yaml: { type: 'stdio', command: 'node', source: 'yaml' },
    });

    await expect(
      resolveMCPDiscoveryConfigSnapshot(user.id, user, {
        initializeMissing: false,
        serverNames: ['Requested__Server'],
      }),
    ).resolves.toEqual({
      collisionServerNames: ['Requested: Server', 'yaml', 'cold'],
      configs: { 'Requested: Server': { ...requested, source: 'config' } },
      missingConfigServerNames: [],
      pendingConfigs: {},
      securityPolicy: { allowedDomains: undefined, allowedAddresses: undefined },
      sourceDocuments: [],
    });
    expect(mockEnsureConfigServers).toHaveBeenCalledWith(
      { 'Requested: Server': requested },
      expect.objectContaining({ initializeMissing: false }),
    );
  });

  it('keeps warm servers while omitting an unrelated cold Config override', async () => {
    const user = { id: 'user-1', role: 'USER', tenantId: 'tenant-a' };
    const warm = { type: 'streamable-http', url: 'https://warm.example.com' };
    const cold = { type: 'streamable-http', url: 'https://new.example.com' };
    const warmParsed = { ...warm, source: 'config' };
    mockGetMCPAppConfigSnapshot.mockResolvedValue({
      config: { mcpConfig: { warm, cold } },
      sourceDocuments: [],
    });
    mockEnsureConfigServers.mockResolvedValue({ warm: warmParsed });
    mockGetAllServerConfigsFresh.mockResolvedValue({
      warm: warmParsed,
      cold: { ...cold, url: 'https://old.example.com', source: 'yaml' },
      stable: { type: 'stdio', command: 'node', source: 'yaml' },
    });

    await expect(
      resolveMCPDiscoveryConfigSnapshot(user.id, user, { initializeMissing: false }),
    ).resolves.toEqual({
      collisionServerNames: ['warm', 'stable', 'cold'],
      configs: {
        warm: warmParsed,
        stable: { type: 'stdio', command: 'node', source: 'yaml' },
      },
      missingConfigServerNames: ['cold'],
      pendingConfigs: { cold },
      securityPolicy: { allowedDomains: undefined, allowedAddresses: undefined },
      sourceDocuments: [],
    });
  });

  it('uses only projected Config and targeted DB authority reads on a bounded invoke fence', async () => {
    const user = { id: 'user-1', role: 'USER', tenantId: 'tenant-a' };
    const rawConfig = { type: 'streamable-http', url: 'https://mcp.example.com' };
    const parsedConfig = { ...rawConfig, source: 'config' };
    const sourceDocuments = [{ _id: 'config-b', updatedAt: '2026-08-07T00:00:00.000Z' }];
    mockGetMCPAppConfigSnapshot.mockResolvedValue({
      config: { mcpConfig: { search: rawConfig } },
      sourceDocuments,
    });
    mockGetUserServerConfigFresh.mockResolvedValue(undefined);

    await expect(
      resolveMCPDiscoveryConfigSnapshot(user.id, user, {
        bounded: true,
        serverNames: ['search'],
        expectedServerConfigs: { search: parsedConfig },
      }),
    ).resolves.toMatchObject({
      collisionServerNames: ['search'],
      configs: { search: parsedConfig },
      sourceDocuments,
    });

    expect(mockGetMCPAppConfigSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        failClosed: true,
      }),
    );
    expect(mockGetUserServerConfigFresh).toHaveBeenCalledWith('search', user.id, user.role);
    expect(mockGetAccessibleUserServerNamesFresh).not.toHaveBeenCalled();
    expect(mockEnsureConfigServers).not.toHaveBeenCalled();
    expect(mockGetAllServerConfigsFresh).not.toHaveBeenCalled();
  });

  it('loads a fresh complete DB name index for normalization-sensitive bounded authority', async () => {
    const user = { id: 'user-1', role: 'USER', tenantId: 'tenant-a' };
    const rawConfig = { type: 'streamable-http', url: 'https://mcp.example.com' };
    const parsedConfig = { ...rawConfig, source: 'config' };
    mockGetMCPAppConfigSnapshot.mockResolvedValue({
      config: { mcpConfig: { 'Sales Force': rawConfig } },
      sourceDocuments: [],
    });
    mockGetAccessibleUserServerNamesFresh.mockResolvedValue(['Sales_Force']);
    mockGetUserServerConfigFresh.mockResolvedValue(undefined);

    const result = await resolveMCPDiscoveryConfigSnapshot(user.id, user, {
      bounded: true,
      serverNames: ['Sales Force'],
      expectedServerConfigs: { 'Sales Force': parsedConfig },
    });

    expect(result.collisionServerNames).toEqual(['Sales Force', 'Sales_Force']);
    expect(mockGetAccessibleUserServerNamesFresh).toHaveBeenCalledWith(user.id, user.role);
  });
});
