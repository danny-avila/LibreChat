const mockGetAppConfig = jest.fn();
const mockEnsureConfigServers = jest.fn();
const mockGetAllServerConfigsFresh = jest.fn();
const mockResolveAllowlists = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  getTenantId: jest.fn().mockReturnValue(undefined),
  logger: { warn: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
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
    resolveAllowlists: mockResolveAllowlists,
  }),
}));

jest.mock('./Config', () => ({ getAppConfig: mockGetAppConfig }));

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
    mockGetAppConfig.mockResolvedValue({
      mcpConfig: { search: rawConfig },
      mcpSettings: securityPolicy,
    });
    mockEnsureConfigServers.mockResolvedValue({ search: parsedConfig });
    mockGetAllServerConfigsFresh.mockResolvedValue({ search: parsedConfig });

    await expect(resolveMCPDiscoveryConfigSnapshot(user.id, user)).resolves.toEqual({
      configs: { search: parsedConfig },
      securityPolicy,
    });

    expect(mockGetAppConfig).toHaveBeenCalledTimes(1);
    expect(mockGetAppConfig).toHaveBeenCalledWith({
      userId: user.id,
      role: user.role,
      idOnTheSource: user.idOnTheSource,
      tenantId: user.tenantId,
      refresh: true,
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
    mockGetAppConfig.mockResolvedValue({
      mcpConfig: { search: rawConfig },
      mcpSettings: securityPolicy,
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
    mockGetAppConfig.mockResolvedValue({
      mcpConfig: { 'Requested: Server': requested, cold: unrelated },
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
      securityPolicy: { allowedDomains: undefined, allowedAddresses: undefined },
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
    mockGetAppConfig.mockResolvedValue({ mcpConfig: { warm, cold } });
    mockEnsureConfigServers.mockResolvedValue({ warm: warmParsed });
    mockGetAllServerConfigsFresh.mockResolvedValue({
      warm: warmParsed,
      cold: { ...cold, url: 'https://old.example.com', source: 'yaml' },
      stable: { type: 'stdio', command: 'node', source: 'yaml' },
    });

    await expect(
      resolveMCPDiscoveryConfigSnapshot(user.id, user, { initializeMissing: false }),
    ).resolves.toEqual({
      configs: {
        warm: warmParsed,
        stable: { type: 'stdio', command: 'node', source: 'yaml' },
      },
      securityPolicy: { allowedDomains: undefined, allowedAddresses: undefined },
    });
  });
});
