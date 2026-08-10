import { Constants, normalizeServerName } from 'librechat-data-provider';
import type { LCAvailableTools, ParsedServerConfig } from './types';
import type { MCPToolInput, MCPToolCacheDeps } from './tools';
import {
  createMCPConnectionProvenance,
  createMCPToolCatalogEnvelope,
  createMCPToolCatalogSecurityPolicyIdentity,
  isMCPToolCatalogEnvelope,
} from './catalog';
import { getMCPAppToolsPublicationGeneration } from './toolsChanged';
import { createMCPToolCacheService } from './tools';

const requestScopedConfig: ParsedServerConfig = {
  type: 'streamable-http',
  url: 'https://mcp.example.com/{{LIBRECHAT_BODY_CONVERSATIONID}}/mcp',
  source: 'yaml',
};

const cacheableConfig: ParsedServerConfig = {
  type: 'streamable-http',
  url: 'https://mcp.example.com/mcp',
  source: 'yaml',
};
const testSecurityPolicyIdentity = () =>
  createMCPToolCatalogSecurityPolicyIdentity({ allowedDomains: null, allowedAddresses: null });

function createTestProvenance({
  userId = 'u1',
  serverName,
  serverConfig = cacheableConfig,
  authorizationIdentity = 'none',
  authorizationKind,
}: {
  userId?: string;
  serverName: string;
  serverConfig?: ParsedServerConfig;
  authorizationIdentity?: string;
  authorizationKind?: 'none' | 'oauth' | 'obo';
}) {
  return createMCPConnectionProvenance(
    {
      tenantId: null,
      userId,
      serverName,
      serverConfig,
      securityPolicyIdentity: testSecurityPolicyIdentity(),
      authorizationIdentity,
    },
    'user',
    authorizationKind,
  );
}

const originalCredsKey = process.env.CREDS_KEY;
const originalJwtSecret = process.env.JWT_SECRET;

const tenantConfig: ParsedServerConfig = {
  ...cacheableConfig,
  source: 'config',
};

const toolName = (name: string, server: string) =>
  `${name}${Constants.mcp_delimiter}${normalizeServerName(server)}`;

const makeTool = (name: string) => ({
  type: 'function' as const,
  ['function']: { name, description: '', parameters: { type: 'object' as const, properties: {} } },
});

const cachedTools: LCAvailableTools = {
  [toolName('search', 'brave')]: makeTool(toolName('search', 'brave')),
};
const serverTools = cachedTools;

function requireTools(tools: LCAvailableTools | null): LCAvailableTools {
  expect(tools).not.toBeNull();
  return tools ?? {};
}

function createMockDeps(overrides: Partial<MCPToolCacheDeps> = {}): MCPToolCacheDeps {
  const getCachedTools = overrides.getCachedTools ?? jest.fn().mockResolvedValue(null);
  const getMCPServerCatalog =
    overrides.getMCPServerCatalog ??
    (async (options: { userId: string; serverName: string; tenantId: string | null }) => {
      const cached = await getCachedTools(options);
      return isMCPToolCatalogEnvelope(cached) ? cached : null;
    });
  return {
    getCachedTools,
    getMCPServerCatalog,
    setCachedTools: jest.fn().mockResolvedValue(true),
    getCachedAppServerTools: jest.fn().mockResolvedValue(null),
    setCachedAppServerTools: jest.fn().mockResolvedValue(true),
    setMCPServerCatalog: jest.fn().mockResolvedValue(true),
    getServerConfig: jest.fn().mockResolvedValue(cacheableConfig),
    getScopedSecurityPolicy: jest.fn().mockResolvedValue({
      allowedDomains: null,
      allowedAddresses: null,
    }),
    ...overrides,
  };
}

function createSharedCacheDeps(params: {
  config: ParsedServerConfig;
  app?: boolean;
  appCache?: Map<string, LCAvailableTools>;
  userCache?: Map<string, LCAvailableTools>;
}): MCPToolCacheDeps {
  const { config, app = true } = params;
  const appCache = params.appCache ?? new Map<string, LCAvailableTools>();
  const userCache = params.userCache ?? new Map<string, LCAvailableTools>();
  const appKey = (serverName: string, generation: string) =>
    JSON.stringify([serverName, generation]);
  const userKey = (userId: string, serverName: string, generation?: string) =>
    JSON.stringify([userId, serverName, generation]);

  return {
    getCachedTools: jest.fn(async ({ userId, serverName, configGeneration } = {}) => {
      if (!userId || !serverName) {
        return null;
      }
      return userCache.get(userKey(userId, serverName, configGeneration)) ?? null;
    }),
    setCachedTools: jest.fn(async (tools, { userId, serverName, configGeneration } = {}) => {
      if (userId && serverName) {
        userCache.set(userKey(userId, serverName, configGeneration), tools);
      }
      return true;
    }),
    setCachedToolsIfCurrent: jest.fn(async (tools, { userId, serverName, configGeneration }) => {
      userCache.set(userKey(userId, serverName, configGeneration), tools);
      return true;
    }),
    getCachedAppServerTools: jest.fn(
      async (serverName, generation) => appCache.get(appKey(serverName, generation)) ?? null,
    ),
    setCachedAppServerTools: jest.fn(async (serverName, generation, tools) => {
      appCache.set(appKey(serverName, generation), tools);
      return true;
    }),
    getServerConfig: jest.fn().mockResolvedValue(config),
    getAllServerConfigs: jest.fn().mockResolvedValue(app ? { dynamic: config } : {}),
    isAppServerConfig: jest.fn().mockResolvedValue(app),
  };
}

describe('createMCPToolCacheService', () => {
  beforeAll(() => {
    process.env.CREDS_KEY = 'tool-cache-test-key';
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

  describe('configuration-addressed app catalogs', () => {
    it('restores the static catalog without discovering app server configs', async () => {
      const staticTools = { builtin: makeTool('builtin') };
      const updateCachedGlobalTools = jest.fn(async (update) => update({}));
      const getAllServerConfigs = jest.fn().mockResolvedValue({ alpha: cacheableConfig });
      const service = createMCPToolCacheService(
        createMockDeps({ updateCachedGlobalTools, getAllServerConfigs }),
      );

      await service.syncStaticTools(staticTools);

      expect(updateCachedGlobalTools).toHaveBeenCalledTimes(1);
      expect(updateCachedGlobalTools.mock.calls[0][0]({})).toEqual(staticTools);
      expect(getAllServerConfigs).not.toHaveBeenCalled();
    });

    it('isolates old and new replicas instead of electing the first publisher', async () => {
      const appCache = new Map<string, LCAvailableTools>();
      const oldConfig = cacheableConfig;
      const newConfig = { ...cacheableConfig, url: 'https://mcp.example.com/v2/mcp' };
      const oldService = createMCPToolCacheService(
        createSharedCacheDeps({ config: oldConfig, appCache }),
      );
      const newService = createMCPToolCacheService(
        createSharedCacheDeps({ config: newConfig, appCache }),
      );
      const oldTools = { [toolName('old', 'dynamic')]: makeTool(toolName('old', 'dynamic')) };
      const newTools = { [toolName('new', 'dynamic')]: makeTool(toolName('new', 'dynamic')) };

      await newService.replaceAppServerTools({
        serverName: 'dynamic',
        serverTools: newTools,
        publicationGeneration: getMCPAppToolsPublicationGeneration(newConfig),
        publicationRevision: '1',
      });
      await oldService.replaceAppServerTools({
        serverName: 'dynamic',
        serverTools: oldTools,
        publicationGeneration: getMCPAppToolsPublicationGeneration(oldConfig),
        publicationRevision: '1',
      });

      await expect(newService.getMCPServerTools('user', 'dynamic')).resolves.toEqual(newTools);
      await expect(oldService.getMCPServerTools('user', 'dynamic')).resolves.toEqual(oldTools);
      expect(appCache).toHaveProperty('size', 2);
    });

    it('does not replace a known-good slice when startup inspection is incomplete', async () => {
      const setCachedAppServerTools = jest.fn().mockResolvedValue(true);
      const deps = createMockDeps({
        getAllServerConfigs: jest.fn().mockResolvedValue({
          complete: { ...cacheableConfig, toolFunctions: {} },
          incomplete: { ...cacheableConfig, toolFunctions: undefined },
        }),
        setCachedAppServerTools,
      });

      await createMCPToolCacheService(deps).mergeAppTools({}, {});

      expect(setCachedAppServerTools).toHaveBeenCalledTimes(1);
      expect(setCachedAppServerTools).toHaveBeenCalledWith('complete', expect.any(String), {});
    });

    it('rejects a scoped app catalog until it matches the current app publication', async () => {
      const initialTools = {
        [toolName('initial', 'dynamic')]: makeTool(toolName('initial', 'dynamic')),
      };
      const refreshedTools = {
        [toolName('refreshed', 'dynamic')]: makeTool(toolName('refreshed', 'dynamic')),
      };
      let publishedTools: LCAvailableTools = initialTools;
      let scopedTools: LCAvailableTools = initialTools;
      const getCachedAppServerTools = jest.fn(async () => publishedTools);
      const getMCPServerCatalog = jest.fn(async () =>
        createMCPToolCatalogEnvelope(scopedTools, {
          tenantId: null,
          userId: 'u1',
          serverName: 'dynamic',
          serverConfig: cacheableConfig,
          securityPolicyIdentity: testSecurityPolicyIdentity(),
          authorizationIdentity: 'none',
        }),
      );
      const deps = createMockDeps({
        getAllServerConfigs: jest.fn().mockResolvedValue({ dynamic: cacheableConfig }),
        getCachedAppServerTools,
        getMCPServerCatalog,
      });
      const service = createMCPToolCacheService(deps);
      const readCatalog = () =>
        service.getMCPServerCatalog({
          tenantId: null,
          userId: 'u1',
          serverName: 'dynamic',
          serverConfig: cacheableConfig,
          authorizationIdentity: 'none',
        });

      await expect(readCatalog()).resolves.toMatchObject({
        status: 'ready',
        tools: initialTools,
      });

      publishedTools = { invalid: makeTool('different-name') };

      await expect(readCatalog()).resolves.toEqual({
        status: 'pending_activation',
        reason: 'schema_mismatch',
      });

      publishedTools = refreshedTools;

      await expect(readCatalog()).resolves.toEqual({
        status: 'pending_activation',
        reason: 'schema_mismatch',
      });

      scopedTools = refreshedTools;

      await expect(readCatalog()).resolves.toMatchObject({
        status: 'ready',
        tools: refreshedTools,
      });
      expect(getCachedAppServerTools).toHaveBeenCalledTimes(4);
      expect(getMCPServerCatalog).toHaveBeenCalledTimes(4);
    });
  });

  describe('publication generation fencing', () => {
    it('passes both connection and config generations to the guarded write', async () => {
      const setCachedToolsIfCurrent = jest.fn().mockResolvedValue(true);
      const deps = createMockDeps({
        getServerConfig: jest.fn().mockResolvedValue(tenantConfig),
        getAllServerConfigs: jest.fn().mockResolvedValue({}),
        setCachedToolsIfCurrent,
      });

      await createMCPToolCacheService(deps).updateMCPServerTools({
        userId: 'u1',
        serverName: 'tenant',
        tools: [{ name: 'search' }],
        publicationGeneration: 'connection-generation',
      });

      expect(setCachedToolsIfCurrent).toHaveBeenCalledWith(expect.any(Object), {
        userId: 'u1',
        serverName: 'tenant',
        configGeneration: getMCPAppToolsPublicationGeneration(tenantConfig),
        publicationGeneration: 'connection-generation',
      });
    });

    it('does not return definitions rejected by the publication-generation fence', async () => {
      const deps = createMockDeps({
        getServerConfig: jest.fn().mockResolvedValue(tenantConfig),
        getAllServerConfigs: jest.fn().mockResolvedValue({}),
        setCachedToolsIfCurrent: jest.fn().mockResolvedValue(false),
      });

      await expect(
        createMCPToolCacheService(deps).updateMCPServerTools({
          userId: 'u1',
          serverName: 'tenant',
          tools: [{ name: 'stale' }],
          publicationGeneration: 'stale-generation',
        }),
      ).resolves.toBeNull();
    });

    it('keeps a late old-config publication invisible to current readers', async () => {
      const userCache = new Map<string, LCAvailableTools>();
      const oldConfig = tenantConfig;
      const newConfig = { ...tenantConfig, url: 'https://mcp.example.com/v2/mcp' };
      const oldService = createMCPToolCacheService(
        createSharedCacheDeps({ config: oldConfig, app: false, userCache }),
      );
      const newService = createMCPToolCacheService(
        createSharedCacheDeps({ config: newConfig, app: false, userCache }),
      );
      const oldTools = { [toolName('old', 'dynamic')]: makeTool(toolName('old', 'dynamic')) };
      const newTools = { [toolName('new', 'dynamic')]: makeTool(toolName('new', 'dynamic')) };

      await newService.cacheMCPServerTools({
        userId: 'u1',
        serverName: 'dynamic',
        serverTools: newTools,
        publicationGeneration: 'new-connection',
      });
      await oldService.cacheMCPServerTools({
        userId: 'u1',
        serverName: 'dynamic',
        serverTools: oldTools,
        publicationGeneration: 'old-connection',
      });

      await expect(newService.getMCPServerTools('u1', 'dynamic')).resolves.toEqual(newTools);
    });

    it('does not fall back to an unfenced write when a guard is configured', async () => {
      const setCachedToolsIfCurrent = jest.fn().mockResolvedValue(true);
      const deps = createMockDeps({
        getServerConfig: jest.fn().mockResolvedValue(tenantConfig),
        getAllServerConfigs: jest.fn().mockResolvedValue({}),
        setCachedToolsIfCurrent,
      });

      await createMCPToolCacheService(deps).cacheMCPServerTools({
        userId: 'u1',
        serverName: 'tenant',
        serverTools: {},
      });

      expect(setCachedToolsIfCurrent).not.toHaveBeenCalled();
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });
  });

  it('skips persistent catalog reads and writes when no fingerprint key is configured', async () => {
    delete process.env.CREDS_KEY;
    delete process.env.JWT_SECRET;
    const deps = createMockDeps();
    const { getMCPServerCatalog, updateMCPServerTools } = createMCPToolCacheService(deps);

    try {
      await expect(
        updateMCPServerTools({
          tenantId: null,
          userId: 'u1',
          serverName: 'srv',
          tools: [{ name: 'search' }],
          serverConfig: cacheableConfig,
          authorizationIdentity: 'none',
          persistCatalog: true,
        }),
      ).resolves.toHaveProperty(`search${Constants.mcp_delimiter}srv`);
      await expect(
        getMCPServerCatalog({
          tenantId: null,
          userId: 'u1',
          serverName: 'srv',
          serverConfig: cacheableConfig,
          authorizationIdentity: 'none',
        }),
      ).resolves.toEqual({
        status: 'pending_activation',
        reason: 'authorization_unavailable',
      });
      expect(deps.getCachedTools).not.toHaveBeenCalled();
      expect(deps.setMCPServerCatalog).not.toHaveBeenCalled();
    } finally {
      process.env.CREDS_KEY = 'tool-cache-test-key';
    }
  });

  it('keeps legacy cache dependencies compatible while scoped catalogs fail closed', async () => {
    const legacyGetSecurityPolicy = jest.fn(async (_userId: string) => ({
      allowedDomains: null,
      allowedAddresses: null,
    }));
    const deps = createMockDeps({ getSecurityPolicy: legacyGetSecurityPolicy });
    delete deps.getScopedSecurityPolicy;
    const { getMCPServerCatalog, updateMCPServerTools } = createMCPToolCacheService(deps);

    await updateMCPServerTools({
      tenantId: null,
      userId: 'u1',
      serverName: 'srv',
      serverConfig: cacheableConfig,
      tools: [{ name: 'search' }],
      authorizationIdentity: 'none',
      discoveryProvenance: createTestProvenance({ serverName: 'srv' }),
    });

    await expect(
      getMCPServerCatalog({
        tenantId: null,
        userId: 'u1',
        serverName: 'srv',
        serverConfig: cacheableConfig,
        authorizationIdentity: 'none',
      }),
    ).resolves.toEqual({
      status: 'pending_activation',
      reason: 'authorization_unavailable',
    });
    expect(deps.setMCPServerCatalog).not.toHaveBeenCalled();
    expect(legacyGetSecurityPolicy).not.toHaveBeenCalled();
  });

  it('preserves legacy raw cache reads and writes for two-argument consumers', async () => {
    const legacyTools: LCAvailableTools = {
      [`search${Constants.mcp_delimiter}srv`]: {
        type: 'function',
        function: {
          name: `search${Constants.mcp_delimiter}srv`,
          description: 'Search',
          parameters: { type: 'object', properties: {} },
        },
      },
    };
    const deps = createMockDeps({ getCachedTools: jest.fn().mockResolvedValue(legacyTools) });
    const { cacheMCPServerTools, getMCPServerTools } = createMCPToolCacheService(deps);

    await cacheMCPServerTools({ userId: 'u1', serverName: 'srv', serverTools: legacyTools });
    await expect(getMCPServerTools('u1', 'srv')).resolves.toBe(legacyTools);

    expect(deps.setCachedTools).toHaveBeenCalledWith(legacyTools, {
      userId: 'u1',
      serverName: 'srv',
    });
    expect(deps.getCachedTools).toHaveBeenCalledWith({
      userId: 'u1',
      serverName: 'srv',
      configGeneration: expect.any(String),
    });
  });

  it('keeps legacy raw maps independent from strict scoped catalog envelopes', async () => {
    const legacyTools: LCAvailableTools = {
      [`search${Constants.mcp_delimiter}srv`]: {
        type: 'function',
        function: {
          name: `search${Constants.mcp_delimiter}srv`,
          description: 'Legacy search',
          parameters: { type: 'object', properties: {} },
        },
      },
    };
    const scopedTools: LCAvailableTools = {
      [`read${Constants.mcp_delimiter}srv`]: {
        type: 'function',
        function: {
          name: `read${Constants.mcp_delimiter}srv`,
          description: 'Scoped read',
          parameters: { type: 'object', properties: {} },
        },
      },
    };
    const getCachedTools = jest.fn().mockResolvedValue(legacyTools);
    const getMCPServerCatalog = jest.fn().mockResolvedValue(
      createMCPToolCatalogEnvelope(scopedTools, {
        tenantId: 'tenant-a',
        userId: 'u1',
        serverName: 'srv',
        serverConfig: cacheableConfig,
        securityPolicyIdentity: testSecurityPolicyIdentity(),
        authorizationIdentity: 'none',
      }),
    );
    const service = createMCPToolCacheService(
      createMockDeps({ getCachedTools, getMCPServerCatalog }),
    );

    await expect(service.getMCPServerTools('u1', 'srv')).resolves.toEqual(legacyTools);
    await expect(
      service.getMCPServerCatalog({
        tenantId: 'tenant-a',
        userId: 'u1',
        serverName: 'srv',
        serverConfig: cacheableConfig,
        authorizationIdentity: 'none',
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'ready', tools: scopedTools }));

    expect(getCachedTools).toHaveBeenCalledTimes(1);
    expect(getMCPServerCatalog).toHaveBeenCalledTimes(1);
  });

  it('accepts the original strict legacy setter callback signature', async () => {
    const writes: Array<{
      tools: LCAvailableTools;
      options?: { userId?: string; serverName?: string };
    }> = [];
    const setCachedTools = async (
      tools: LCAvailableTools,
      options?: { userId?: string; serverName?: string },
    ): Promise<boolean> => {
      writes.push({ tools, options });
      return true;
    };
    const deps: MCPToolCacheDeps = {
      getCachedTools: async () => null,
      setCachedTools,
      getServerConfig: async () => cacheableConfig,
    };
    const { updateMCPServerTools } = createMCPToolCacheService(deps);

    const tools = await updateMCPServerTools({
      userId: 'u1',
      serverName: 'srv',
      tools: [{ name: 'search' }],
    });

    expect(writes).toEqual([{ tools, options: { userId: 'u1', serverName: 'srv' } }]);
  });

  it('accepts the original strict legacy getter callback signature', async () => {
    const getCachedTools = async (_options?: {
      userId?: string;
      serverName?: string;
      tenantId?: string | null;
    }): Promise<LCAvailableTools | null> => null;
    const deps: MCPToolCacheDeps = {
      getCachedTools,
      setCachedTools: async () => true,
      getServerConfig: async () => cacheableConfig,
    };

    await expect(
      createMCPToolCacheService(deps).getMCPServerTools('u1', 'srv'),
    ).resolves.toBeNull();
  });

  it('keeps the separately named scoped reader fail-closed without auth identity', async () => {
    const deps = createMockDeps();
    const { getScopedMCPServerTools } = createMCPToolCacheService(deps);

    await expect(
      getScopedMCPServerTools({
        tenantId: null,
        userId: 'u1',
        serverName: 'srv',
        serverConfig: cacheableConfig,
        authorizationIdentity: null,
      }),
    ).resolves.toBeNull();
    expect(deps.getCachedTools).not.toHaveBeenCalled();
  });

  it('fails closed when declared custom credentials were not resolved', async () => {
    const protectedConfig: ParsedServerConfig = {
      ...cacheableConfig,
      customUserVars: { TOKEN: { title: 'Token', description: 'Token' } },
    };
    const deps = createMockDeps();
    const { getMCPServerCatalog, updateMCPServerTools } = createMCPToolCacheService(deps);

    await updateMCPServerTools({
      tenantId: null,
      userId: 'u1',
      serverName: 'srv',
      tools: [{ name: 'search' }],
      serverConfig: protectedConfig,
      authorizationIdentity: 'none',
    });
    await expect(
      getMCPServerCatalog({
        tenantId: null,
        userId: 'u1',
        serverName: 'srv',
        serverConfig: protectedConfig,
        authorizationIdentity: 'none',
      }),
    ).resolves.toEqual({ status: 'pending_activation', reason: 'missing_credentials' });

    expect(deps.getCachedTools).not.toHaveBeenCalled();
    expect(deps.setMCPServerCatalog).not.toHaveBeenCalled();
  });

  it('does not persist an authoritative empty catalog with unresolved custom credentials', async () => {
    const protectedConfig: ParsedServerConfig = {
      ...cacheableConfig,
      customUserVars: { TOKEN: { title: 'Token', description: 'Token' } },
    };
    const deps = createMockDeps();
    const { updateMCPServerTools } = createMCPToolCacheService(deps);

    await updateMCPServerTools({
      tenantId: null,
      userId: 'u1',
      serverName: 'srv',
      tools: [],
      serverConfig: protectedConfig,
      authorizationIdentity: 'none',
    });

    expect(deps.setMCPServerCatalog).not.toHaveBeenCalled();
  });

  describe('updateMCPServerTools', () => {
    it('returns empty object for null tools', async () => {
      const deps = createMockDeps();
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      const result = await updateMCPServerTools({
        userId: 'u1',
        serverName: 'srv',
        tools: null,
      });

      expect(result).toEqual({});
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('replaces a stale cache entry when the server returns an empty tools array', async () => {
      const deps = createMockDeps();
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      const result = requireTools(
        await updateMCPServerTools({
          userId: 'u1',
          serverName: 'srv',
          tools: [],
          tenantId: null,
          authorizationIdentity: 'none',
          discoveryProvenance: createTestProvenance({
            serverName: 'srv',
            authorizationKind: 'oauth',
          }),
        }),
      );

      expect(result).toEqual({});
      expect(deps.setMCPServerCatalog).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: {},
          metadata: expect.objectContaining({ authorizationKind: 'oauth' }),
        }),
        {
          userId: 'u1',
          serverName: 'srv',
          tenantId: null,
        },
      );
    });

    it('builds MODEL-FACING keys with the normalized server name, store keyed raw', async () => {
      /** Tool keys become builder tool ids, agent.tools entries, tool_options
       *  keys, and definition names, and must equal the runtime instance name,
       *  which embeds `normalizeServerName(serverName)`. */
      const deps = createMockDeps();
      const { updateMCPServerTools } = createMCPToolCacheService(deps);
      const tools: MCPToolInput[] = [
        { name: 'search', description: 'Search', inputSchema: { type: 'object', properties: {} } },
      ];

      const result = requireTools(
        await updateMCPServerTools({
          userId: 'u1',
          serverName: 'Connector: Company',
          tools,
          tenantId: null,
          authorizationIdentity: 'none',
          discoveryProvenance: createTestProvenance({ serverName: 'Connector: Company' }),
        }),
      );

      const expectedKey = `search${Constants.mcp_delimiter}Connector__Company`;
      expect(result[expectedKey]).toBeDefined();
      expect(result[expectedKey]['function'].name).toBe(expectedKey);
      expect(deps.setMCPServerCatalog).toHaveBeenCalledWith(
        expect.objectContaining({ tools: result }),
        {
          userId: 'u1',
          serverName: 'Connector: Company',
          tenantId: null,
        },
      );
    });

    it('constructs tool names with mcp_delimiter and caches them', async () => {
      const deps = createMockDeps();
      const { updateMCPServerTools } = createMCPToolCacheService(deps);
      const tools: MCPToolInput[] = [
        {
          name: 'search',
          description: 'Search docs',
          inputSchema: { type: 'object', properties: {} },
          outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
          annotations: { readOnlyHint: true },
        },
      ];

      const result = requireTools(
        await updateMCPServerTools({
          userId: 'u1',
          serverName: 'brave',
          tools,
          tenantId: null,
          authorizationIdentity: 'none',
          discoveryProvenance: createTestProvenance({
            serverName: 'brave',
            authorizationKind: 'oauth',
          }),
        }),
      );

      const expectedKey = `search${Constants.mcp_delimiter}brave`;
      expect(result[expectedKey]).toBeDefined();
      expect(result[expectedKey].type).toBe('function');
      expect(result[expectedKey]['function'].name).toBe(expectedKey);
      expect(result[expectedKey]['function'].description).toBe('Search docs');
      expect(result[expectedKey]['function'].outputSchema).toEqual({
        type: 'object',
        properties: { result: { type: 'string' } },
      });
      expect(result[expectedKey]['function'].annotations).toEqual({ readOnlyHint: true });
      expect(deps.setMCPServerCatalog).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: result,
          metadata: expect.objectContaining({ authorizationKind: 'oauth' }),
        }),
        {
          userId: 'u1',
          serverName: 'brave',
          tenantId: null,
        },
      );
    });

    it('builds tool names without caching when the resolved config is request-scoped', async () => {
      const deps = createMockDeps({
        getServerConfig: jest.fn().mockResolvedValue(requestScopedConfig),
      });
      const { updateMCPServerTools } = createMCPToolCacheService(deps);
      const tools: MCPToolInput[] = [
        {
          name: 'search',
          description: 'Search request-scoped docs',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const result = requireTools(
        await updateMCPServerTools({
          userId: 'u1',
          serverName: 'body-scoped',
          tools,
          tenantId: null,
          authorizationIdentity: 'none',
        }),
      );

      const expectedKey = `search${Constants.mcp_delimiter}body-scoped`;
      expect(result[expectedKey]).toBeDefined();
      expect(deps.getServerConfig).toHaveBeenCalledWith('body-scoped', 'u1');
      expect(deps.setMCPServerCatalog).not.toHaveBeenCalled();
    });

    it('uses a provided serverConfig without calling the resolver', async () => {
      const deps = createMockDeps();
      const { updateMCPServerTools } = createMCPToolCacheService(deps);
      const tools: MCPToolInput[] = [{ name: 'search' }];

      await updateMCPServerTools({
        userId: 'u1',
        serverName: 'body-scoped',
        tools,
        serverConfig: requestScopedConfig,
      });

      expect(deps.getServerConfig).not.toHaveBeenCalled();
      expect(deps.setMCPServerCatalog).not.toHaveBeenCalled();
    });

    it('builds live tools but skips persistence when authorization scope is unavailable', async () => {
      const deps = createMockDeps();
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      const result = requireTools(
        await updateMCPServerTools({
          userId: 'u1',
          serverName: 'oauth',
          tools: [{ name: 'search' }],
          serverConfig: cacheableConfig,
          authorizationIdentity: null,
        }),
      );

      expect(Object.keys(result)).toEqual([`search${Constants.mcp_delimiter}oauth`]);
      expect(deps.setMCPServerCatalog).not.toHaveBeenCalled();
    });

    it('skips persistent writes when config resolution fails', async () => {
      const deps = createMockDeps({
        getServerConfig: jest.fn().mockRejectedValue(new Error('registry not initialized')),
      });
      const { updateMCPServerTools } = createMCPToolCacheService(deps);
      const tools: MCPToolInput[] = [{ name: 'search' }];

      await expect(
        updateMCPServerTools({
          userId: 'u1',
          serverName: 'srv',
          tools,
          tenantId: null,
          authorizationIdentity: 'none',
        }),
      ).resolves.toEqual(
        expect.objectContaining({ [`search${Constants.mcp_delimiter}srv`]: expect.any(Object) }),
      );

      expect(deps.setMCPServerCatalog).not.toHaveBeenCalled();
    });

    it('keeps live tools usable when the catalog write fails', async () => {
      const deps = createMockDeps({
        setMCPServerCatalog: jest.fn().mockRejectedValue(new Error('Redis down')),
      });
      const { updateMCPServerTools } = createMCPToolCacheService(deps);
      const tools: MCPToolInput[] = [{ name: 'tool1' }];

      await expect(
        updateMCPServerTools({
          userId: 'u1',
          serverName: 'srv',
          tools,
          tenantId: null,
          authorizationIdentity: 'none',
        }),
      ).resolves.toEqual(
        expect.objectContaining({ [`tool1${Constants.mcp_delimiter}srv`]: expect.any(Object) }),
      );
    });

    it('does not publish a live app snapshot without pre-fetch ordering', async () => {
      const deps = createMockDeps();

      await expect(
        createMCPToolCacheService(deps).replaceAppServerTools({
          serverName: 'dynamic',
          serverTools: {},
          publicationGeneration: 'config-generation',
        }),
      ).resolves.toBe(false);

      expect(deps.setCachedAppServerTools).not.toHaveBeenCalled();
    });

    it('caches server tools with userId and serverName', async () => {
      const deps = createMockDeps();
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await cacheMCPServerTools({
        userId: 'u1',
        serverName: 'brave',
        serverTools,
        tenantId: null,
        authorizationIdentity: 'none',
        discoveryProvenance: createTestProvenance({
          serverName: 'brave',
          authorizationKind: 'oauth',
        }),
      });

      expect(deps.setMCPServerCatalog).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: serverTools,
          metadata: expect.objectContaining({ authorizationKind: 'oauth' }),
        }),
        { userId: 'u1', serverName: 'brave', tenantId: null },
      );
    });

    it('skips caching for request-scoped servers', async () => {
      const deps = createMockDeps({
        getServerConfig: jest.fn().mockResolvedValue(requestScopedConfig),
        getAllServerConfigs: jest.fn().mockResolvedValue({
          'foo bar': cacheableConfig,
          foo_bar: cacheableConfig,
        }),
      });
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await cacheMCPServerTools({ userId: 'u1', serverName: 'body-scoped', serverTools });

      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('does not fail live discovery when the catalog write fails', async () => {
      const deps = createMockDeps({
        setMCPServerCatalog: jest.fn().mockRejectedValue(new Error('write failed')),
      });
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await expect(
        cacheMCPServerTools({
          userId: 'u1',
          serverName: 'srv',
          serverTools,
          tenantId: null,
          authorizationIdentity: 'none',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('user catalog authority', () => {
    it('passes both connection and config generations to the guarded write', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(
          createMCPToolCatalogEnvelope(cachedTools, {
            tenantId: 'tenant-a',
            userId: 'u1',
            serverName: 'brave',
            serverConfig: cacheableConfig,
            securityPolicyIdentity: testSecurityPolicyIdentity(),
            authorizationIdentity: 'none',
          }),
        ),
        getServerConfig: jest.fn().mockResolvedValue(cacheableConfig),
      });
      const { getScopedMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getScopedMCPServerTools({
        tenantId: 'tenant-a',
        userId: 'u1',
        role: 'ADMIN',
        serverName: 'brave',
        serverConfig: cacheableConfig,
        authorizationIdentity: 'none',
      });

      expect(result).toEqual(cachedTools);
      expect(deps.getCachedTools).toHaveBeenCalledWith({
        userId: 'u1',
        serverName: 'brave',
        tenantId: 'tenant-a',
      });
      expect(deps.getScopedSecurityPolicy).toHaveBeenCalledWith({
        userId: 'u1',
        tenantId: 'tenant-a',
        role: 'ADMIN',
      });
    });

    it('validates a warm catalog with the supplied authoritative policy identity', async () => {
      const policyA = createMCPToolCatalogSecurityPolicyIdentity({
        allowedDomains: ['mcp.example.com'],
      });
      const policyB = createMCPToolCatalogSecurityPolicyIdentity({
        allowedDomains: ['mcp.internal.example.com'],
      });
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(
          createMCPToolCatalogEnvelope(cachedTools, {
            tenantId: 'tenant-a',
            userId: 'u1',
            serverName: 'brave',
            serverConfig: cacheableConfig,
            securityPolicyIdentity: policyA,
            authorizationIdentity: 'none',
          }),
        ),
        getScopedSecurityPolicy: jest.fn().mockRejectedValue(new Error('must not be consulted')),
      });
      const { getScopedMCPServerTools } = createMCPToolCacheService(deps);

      await expect(
        getScopedMCPServerTools({
          tenantId: 'tenant-a',
          userId: 'u1',
          serverName: 'brave',
          serverConfig: cacheableConfig,
          authorizationIdentity: 'none',
          securityPolicyIdentity: policyB,
        }),
      ).resolves.toBeNull();
      await expect(
        getScopedMCPServerTools({
          tenantId: 'tenant-a',
          userId: 'u1',
          serverName: 'brave',
          serverConfig: cacheableConfig,
          authorizationIdentity: 'none',
          securityPolicyIdentity: policyA,
        }),
      ).resolves.toEqual(cachedTools);
      expect(deps.getScopedSecurityPolicy).not.toHaveBeenCalled();
    });

    it('returns an empty ready catalog distinctly from a cold cache', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(
          createMCPToolCatalogEnvelope(
            {},
            {
              tenantId: null,
              userId: 'u1',
              serverName: 'brave',
              serverConfig: cacheableConfig,
              securityPolicyIdentity: testSecurityPolicyIdentity(),
              authorizationIdentity: 'none',
            },
          ),
        ),
        getServerConfig: jest.fn().mockResolvedValue(cacheableConfig),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools(
        'u1',
        'brave',
        cacheableConfig,
        undefined,
        null,
        'none',
      );

      expect(result).toEqual({});
    });

    it('heals stale raw-keyed cache entries to the normalized key format at read time', async () => {
      /** Entries written before keys embedded the normalized server name would
       *  otherwise make the server's tools vanish for up to the cache TTL —
       *  the definitions-only loader treats this map as authoritative and
       *  never reconnects on a per-key miss. */
      const staleTools: LCAvailableTools = {
        [`search${Constants.mcp_delimiter}Connector: Company`]: {
          type: 'function',
          ['function']: {
            name: `search${Constants.mcp_delimiter}Connector: Company`,
            description: 'Search',
            parameters: { type: 'object', properties: {} },
          },
        },
      };
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(
          createMCPToolCatalogEnvelope(staleTools, {
            tenantId: null,
            userId: 'u1',
            serverName: 'Connector: Company',
            serverConfig: cacheableConfig,
            securityPolicyIdentity: testSecurityPolicyIdentity(),
            authorizationIdentity: 'none',
          }),
        ),
        getServerConfig: jest.fn().mockResolvedValue(cacheableConfig),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools(
        'u1',
        'Connector: Company',
        cacheableConfig,
        undefined,
        null,
        'none',
      );

      const healedKey = `search${Constants.mcp_delimiter}Connector__Company`;
      expect(Object.keys(result ?? {})).toEqual([healedKey]);
      expect(result?.[healedKey]['function'].name).toBe(healedKey);
    });

    it('treats legacy raw-keyed entries as cold instead of blessing stale schemas', async () => {
      const legacyKey = `search${Constants.mcp_delimiter}Connector: Company`;
      const legacyTools: LCAvailableTools = {
        [legacyKey]: {
          type: 'function',
          function: {
            name: legacyKey,
            description: 'Search',
            parameters: { type: 'object', properties: {} },
          },
        },
      };
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(legacyTools),
        getServerConfig: jest.fn().mockResolvedValue(cacheableConfig),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools(
        'u1',
        'Connector: Company',
        cacheableConfig,
        undefined,
        null,
        'none',
      );

      expect(result).toBeNull();
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('returns the same reference for safe server names (no heal pass)', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(
          createMCPToolCatalogEnvelope(cachedTools, {
            tenantId: null,
            userId: 'u1',
            serverName: 'brave',
            serverConfig: cacheableConfig,
            securityPolicyIdentity: testSecurityPolicyIdentity(),
            authorizationIdentity: 'none',
          }),
        ),
        getServerConfig: jest.fn().mockResolvedValue(cacheableConfig),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools(
        'u1',
        'brave',
        cacheableConfig,
        undefined,
        null,
        'none',
      );

      expect(result).toBe(cachedTools);
      expect(deps.setCachedToolsIfCurrent).toBeUndefined();
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });
  });

  describe('tool construction and reads', () => {
    it('returns empty for a null tool list without caching', async () => {
      const deps = createMockDeps();
      const result = await createMCPToolCacheService(deps).updateMCPServerTools({
        userId: 'u1',
        serverName: 'srv',
        tools: null,
      });

      expect(result).toEqual({});
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('builds model-facing names with the normalized server name', async () => {
      const deps = createMockDeps();
      const tools: MCPToolInput[] = [{ name: 'search', description: 'Search' }];
      const result = await createMCPToolCacheService(deps).updateMCPServerTools({
        userId: 'u1',
        serverName: 'Connector: Company',
        tools,
      });
      const expected = toolName('search', 'Connector: Company');

      expect(result?.[expected]?.['function'].name).toBe(expected);
      expect(deps.setCachedTools).toHaveBeenCalledWith(result, {
        userId: 'u1',
        serverName: 'Connector: Company',
        configGeneration: undefined,
      });
    });

    it('builds request-scoped tools without caching them', async () => {
      const deps = createMockDeps({
        getServerConfig: jest.fn().mockResolvedValue(requestScopedConfig),
      });
      const result = await createMCPToolCacheService(deps).updateMCPServerTools({
        userId: 'u1',
        serverName: 'body-scoped',
        tools: [{ name: 'search' }],
      });

      expect(result?.[toolName('search', 'body-scoped')]).toBeDefined();
      expect(deps.setCachedTools).not.toHaveBeenCalled();
      expect(deps.setCachedAppServerTools).not.toHaveBeenCalled();
    });

    it('treats a missing app slice differently from an authoritative empty slice', async () => {
      const getCachedAppServerTools = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({});
      const deps = createMockDeps({
        getServerConfig: jest.fn().mockResolvedValue(cacheableConfig),
        getAllServerConfigs: jest.fn().mockResolvedValue({ dynamic: cacheableConfig }),
        getCachedAppServerTools,
      });
      const service = createMCPToolCacheService(deps);

      await expect(service.getMCPServerTools('u1', 'dynamic')).resolves.toBeNull();
      await expect(service.getMCPServerTools('u1', 'dynamic')).resolves.toEqual({});
    });

    it('heals raw server names in a configuration-addressed user slice', async () => {
      const staleName = `search${Constants.mcp_delimiter}Connector: Company`;
      const staleTools = { [staleName]: makeTool(staleName) };
      const deps = createMockDeps({
        getServerConfig: jest.fn().mockResolvedValue(tenantConfig),
        getAllServerConfigs: jest.fn().mockResolvedValue({}),
        getCachedTools: jest.fn().mockResolvedValue(staleTools),
      });

      const result = await createMCPToolCacheService(deps).getMCPServerTools(
        'u1',
        'Connector: Company',
      );
      const healed = toolName('search', 'Connector: Company');

      expect(Object.keys(result ?? {})).toEqual([healed]);
      expect(result?.[healed]['function'].name).toBe(healed);
    });

    it('returns null without reading cache for request-scoped servers', async () => {
      const deps = createMockDeps();
      await expect(
        createMCPToolCacheService(deps).getMCPServerTools('u1', 'body-scoped', requestScopedConfig),
      ).resolves.toBeNull();
      expect(deps.getCachedTools).not.toHaveBeenCalled();
      expect(deps.getCachedAppServerTools).not.toHaveBeenCalled();
    });

    it('skips catalog reads when authorization scope is unavailable', async () => {
      const deps = createMockDeps({ getCachedTools: jest.fn().mockResolvedValue(cachedTools) });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      await expect(
        getMCPServerTools('u1', 'oauth', cacheableConfig, undefined, 'tenant-a', null),
      ).resolves.toBeNull();
      expect(deps.getCachedTools).not.toHaveBeenCalled();
    });

    it('does not migrate a legacy unscoped catalog into a tenant-scoped request', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cachedTools),
      });
      const { getMCPServerCatalog } = createMCPToolCacheService(deps);

      const result = await getMCPServerCatalog({
        tenantId: 'tenant-a',
        userId: 'u1',
        serverName: 'brave',
        serverConfig: cacheableConfig,
        authorizationIdentity: 'none',
      });

      expect(result).toEqual({ status: 'pending_activation', reason: 'cold' });
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('excludes OBO and runtime-identity servers from persistent catalogs', async () => {
      const deps = createMockDeps();
      const { getMCPServerCatalog } = createMCPToolCacheService(deps);
      const userScopedConfig: ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://mcp.example.com/{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        source: 'config',
      };

      const result = await getMCPServerCatalog({
        tenantId: 'tenant-a',
        userId: 'u1',
        serverName: 'graph',
        serverConfig: userScopedConfig,
        authorizationIdentity: 'none',
      });

      expect(result).toEqual({ status: 'pending_activation', reason: 'user_scoped' });
      expect(deps.getCachedTools).not.toHaveBeenCalled();
    });

    it('returns null instead of throwing when the cache read fails', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockRejectedValue(new Error('cache unavailable')),
      });
      await expect(
        createMCPToolCacheService(deps).getMCPServerTools('u1', 'server'),
      ).resolves.toBeNull();
    });
  });
});
