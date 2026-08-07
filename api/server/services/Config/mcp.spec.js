const mockGetMCPServerTools = jest.fn();
const mockGetServerConfig = jest.fn();
const mockGetUserMCPAuthMap = jest.fn();
const mockGetMCPAuthorizationIdentity = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  getTenantId: jest.fn(() => null),
  logger: { warn: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  getUserMCPAuthMap: (...args) => mockGetUserMCPAuthMap(...args),
  getMCPAuthorizationIdentity: (...args) => mockGetMCPAuthorizationIdentity(...args),
  createMCPToolCacheService: jest.fn(() => ({
    mergeAppTools: jest.fn(),
    cacheMCPServerTools: jest.fn(),
    updateMCPServerTools: jest.fn(),
    getMCPServerCatalog: jest.fn(),
    getMCPServerTools: (...args) => mockGetMCPServerTools(...args),
  })),
  MCPServersRegistry: {
    getInstance: jest.fn(() => ({
      getServerConfig: (...args) => mockGetServerConfig(...args),
      resolveCatalogSecurityPolicy: jest.fn(),
    })),
  },
}));

jest.mock('./getCachedTools', () => ({
  getCachedTools: jest.fn(),
  setCachedTools: jest.fn(),
}));

const { getScopedMCPServerTools } = require('./mcp');

describe('getScopedMCPServerTools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerConfig.mockResolvedValue({
      type: 'streamable-http',
      url: 'https://mcp.example.com',
    });
    mockGetMCPServerTools.mockResolvedValue({ search_mcp_docs: {} });
    mockGetUserMCPAuthMap.mockResolvedValue({});
    mockGetMCPAuthorizationIdentity.mockResolvedValue('grant-1');
  });

  it('passes an explicit tenant and no-grant identity for a public server', async () => {
    const findToken = jest.fn();
    const tools = await getScopedMCPServerTools({
      user: { id: 'user-1', tenantId: 'tenant-1' },
      serverName: 'docs',
      findToken,
      findPluginAuthsByKeys: jest.fn(),
    });

    expect(tools).toEqual({ search_mcp_docs: {} });
    expect(mockGetMCPAuthorizationIdentity).not.toHaveBeenCalled();
    expect(mockGetMCPServerTools).toHaveBeenCalledWith(
      'user-1',
      'docs',
      expect.any(Object),
      undefined,
      'tenant-1',
      'none',
    );
  });

  it('fails closed when OAuth grant identity is unavailable', async () => {
    mockGetServerConfig.mockResolvedValue({
      type: 'streamable-http',
      url: 'https://mcp.example.com',
      requiresOAuth: true,
    });
    mockGetMCPAuthorizationIdentity.mockResolvedValue(null);

    await expect(
      getScopedMCPServerTools({
        user: { id: 'user-1' },
        serverName: 'docs',
        findToken: jest.fn(),
        findPluginAuthsByKeys: jest.fn(),
      }),
    ).resolves.toBeNull();
    expect(mockGetMCPServerTools).not.toHaveBeenCalled();
  });
});
