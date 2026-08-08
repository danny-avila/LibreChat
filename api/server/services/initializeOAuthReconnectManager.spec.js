const mockCreateOAuthReconnectionManager = jest.fn();
const mockResolveCurrentMCPToolAuthority = jest.fn();
const mockUseIssuedResolution = jest.fn(async (resolution, action) => await action(resolution));
const mockTenantStorageRun = jest.fn(async (_store, action) => await action());

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
  tenantStorage: { run: mockTenantStorageRun },
}));

jest.mock('~/config', () => ({
  createOAuthReconnectionManager: mockCreateOAuthReconnectionManager,
  getFlowStateManager: jest.fn(() => ({ id: 'flow-manager' })),
}));

jest.mock('~/models', () => ({
  findToken: jest.fn(),
  updateToken: jest.fn(),
  createToken: jest.fn(),
  deleteTokens: jest.fn(),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => ({ id: 'flow-store' })),
}));

jest.mock('./MCPDiscoveryScope', () => ({
  resolveCurrentMCPToolAuthority: mockResolveCurrentMCPToolAuthority,
}));

jest.mock('./MCPAuthority', () => ({
  getMCPAuthorityResolver: () => ({ useIssuedResolution: mockUseIssuedResolution }),
}));

const initializeOAuthReconnectManager = require('./initializeOAuthReconnectManager');

describe('initializeOAuthReconnectManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveCurrentMCPToolAuthority.mockResolvedValue({
      parsedConfig: {
        actor: {
          userId: 'user-1',
          tenantId: 'tenant-1',
          user: { id: 'user-1', tenantId: 'tenant-1', role: 'USER' },
        },
        sourceConfig: { type: 'streamable-http', url: 'https://mcp.example.com' },
        effectiveConfig: { type: 'streamable-http', url: 'https://mcp.example.com' },
        customUserVars: {},
        catalogScope: {
          tenant: 'tenant-revision',
          principal: 'principal-revision',
          server: 'server-revision',
          policy: 'policy-revision',
          config: 'config-revision',
          credentials: 'credential-revision',
        },
      },
      authorityProof: { revision: 'proof-revision' },
    });
  });

  it('restores the explicit tenant actor before resolving a delayed reconnect', async () => {
    await initializeOAuthReconnectManager();
    const resolveAuthority = mockCreateOAuthReconnectionManager.mock.calls[0][3];
    const actor = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      user: { id: 'user-1', tenantId: 'tenant-1', role: 'USER' },
    };

    await resolveAuthority(actor, 'server-1');

    expect(mockTenantStorageRun).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', userId: 'user-1' },
      expect.any(Function),
    );
    expect(mockResolveCurrentMCPToolAuthority).toHaveBeenCalledWith({
      user: actor.user,
      serverName: 'server-1',
      oauthRequiredHint: true,
    });
  });
});
