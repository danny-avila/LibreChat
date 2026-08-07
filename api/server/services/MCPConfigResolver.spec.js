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
});
