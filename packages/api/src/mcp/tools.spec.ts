import { Constants } from 'librechat-data-provider';
import type { LCAvailableTools, ParsedServerConfig } from './types';
import type { MCPToolInput, MCPToolCacheDeps } from './tools';
import {
  createMCPConnectionProvenance,
  createMCPToolCatalogEnvelope,
  createMCPToolCatalogSecurityPolicyIdentity,
} from './catalog';
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
}: {
  userId?: string;
  serverName: string;
  serverConfig?: ParsedServerConfig;
  authorizationIdentity?: string;
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
  );
}

const originalCredsKey = process.env.CREDS_KEY;
const originalJwtSecret = process.env.JWT_SECRET;

function createMockDeps(overrides: Partial<MCPToolCacheDeps> = {}): MCPToolCacheDeps {
  return {
    getCachedTools: jest.fn().mockResolvedValue(null),
    setCachedTools: jest.fn().mockResolvedValue(true),
    setMCPServerCatalog: jest.fn().mockResolvedValue(true),
    getServerConfig: jest.fn().mockResolvedValue(cacheableConfig),
    getScopedSecurityPolicy: jest.fn().mockResolvedValue({
      allowedDomains: null,
      allowedAddresses: null,
    }),
    ...overrides,
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
    expect(deps.getCachedTools).toHaveBeenCalledWith({ userId: 'u1', serverName: 'srv' });
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

      const result = await updateMCPServerTools({ userId: 'u1', serverName: 'srv', tools: null });

      expect(result).toEqual({});
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('replaces a stale cache entry when the server returns an empty tools array', async () => {
      const deps = createMockDeps();
      const { updateMCPServerTools } = createMCPToolCacheService(deps);

      const result = await updateMCPServerTools({
        userId: 'u1',
        serverName: 'srv',
        tools: [],
        tenantId: null,
        authorizationIdentity: 'none',
        discoveryProvenance: createTestProvenance({ serverName: 'srv' }),
      });

      expect(result).toEqual({});
      expect(deps.setMCPServerCatalog).toHaveBeenCalledWith(
        expect.objectContaining({ tools: {} }),
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

      const result = await updateMCPServerTools({
        userId: 'u1',
        serverName: 'Connector: Company',
        tools,
        tenantId: null,
        authorizationIdentity: 'none',
        discoveryProvenance: createTestProvenance({ serverName: 'Connector: Company' }),
      });

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

      const result = await updateMCPServerTools({
        userId: 'u1',
        serverName: 'brave',
        tools,
        tenantId: null,
        authorizationIdentity: 'none',
        discoveryProvenance: createTestProvenance({ serverName: 'brave' }),
      });

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
        expect.objectContaining({ tools: result }),
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

      const result = await updateMCPServerTools({
        userId: 'u1',
        serverName: 'body-scoped',
        tools,
        tenantId: null,
        authorizationIdentity: 'none',
      });

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

      const result = await updateMCPServerTools({
        userId: 'u1',
        serverName: 'oauth',
        tools: [{ name: 'search' }],
        serverConfig: cacheableConfig,
        authorizationIdentity: null,
      });

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
  });

  describe('mergeAppTools', () => {
    it('no-ops when appTools is empty', async () => {
      const deps = createMockDeps();
      const { mergeAppTools } = createMCPToolCacheService(deps);

      await mergeAppTools({});

      expect(deps.getCachedTools).not.toHaveBeenCalled();
      expect(deps.setCachedTools).not.toHaveBeenCalled();
    });

    it('merges app tools with existing cached tools', async () => {
      const existing: LCAvailableTools = {
        old: {
          type: 'function',
          ['function']: {
            name: 'old',
            description: '',
            parameters: { type: 'object', properties: {} },
          },
        },
      };
      const deps = createMockDeps({ getCachedTools: jest.fn().mockResolvedValue(existing) });
      const { mergeAppTools } = createMCPToolCacheService(deps);
      const appTools: LCAvailableTools = {
        new: {
          type: 'function',
          ['function']: {
            name: 'new',
            description: '',
            parameters: { type: 'object', properties: {} },
          },
        },
      };

      await mergeAppTools(appTools);

      expect(deps.setCachedTools).toHaveBeenCalledWith(
        expect.objectContaining({ old: existing.old, new: appTools.new }),
      );
    });

    it('handles null cache (cold start) by defaulting to empty', async () => {
      const deps = createMockDeps({ getCachedTools: jest.fn().mockResolvedValue(null) });
      const { mergeAppTools } = createMCPToolCacheService(deps);
      const appTools: LCAvailableTools = {
        tool: {
          type: 'function',
          ['function']: {
            name: 'tool',
            description: '',
            parameters: { type: 'object', properties: {} },
          },
        },
      };

      await mergeAppTools(appTools);

      expect(deps.setCachedTools).toHaveBeenCalledWith(
        expect.objectContaining({ tool: appTools.tool }),
      );
    });

    it('propagates getCachedTools errors', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockRejectedValue(new Error('cache read failed')),
      });
      const { mergeAppTools } = createMCPToolCacheService(deps);

      await expect(
        mergeAppTools({
          t: {
            type: 'function',
            ['function']: {
              name: 't',
              description: '',
              parameters: { type: 'object', properties: {} },
            },
          },
        }),
      ).rejects.toThrow('cache read failed');
    });
  });

  describe('cacheMCPServerTools', () => {
    const serverTools: LCAvailableTools = {
      tool: {
        type: 'function',
        ['function']: {
          name: 'tool',
          description: '',
          parameters: { type: 'object', properties: {} },
        },
      },
    };

    it('no-ops when serverTools is empty', async () => {
      const deps = createMockDeps();
      const { cacheMCPServerTools } = createMCPToolCacheService(deps);

      await cacheMCPServerTools({ userId: 'u1', serverName: 'srv', serverTools: {} });

      expect(deps.setCachedTools).not.toHaveBeenCalled();
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
        discoveryProvenance: createTestProvenance({ serverName: 'brave' }),
      });

      expect(deps.setMCPServerCatalog).toHaveBeenCalledWith(
        expect.objectContaining({ tools: serverTools }),
        { userId: 'u1', serverName: 'brave', tenantId: null },
      );
    });

    it('skips caching for request-scoped servers', async () => {
      const deps = createMockDeps({
        getServerConfig: jest.fn().mockResolvedValue(requestScopedConfig),
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

  describe('getMCPServerTools', () => {
    const cachedTools: LCAvailableTools = {
      tool: {
        type: 'function',
        ['function']: {
          name: 'tool',
          description: '',
          parameters: { type: 'object', properties: {} },
        },
      },
    };

    it('returns cached tools for cacheable servers', async () => {
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
    });

    it('returns null for request-scoped servers without reading the cache', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cachedTools),
        getServerConfig: jest.fn().mockResolvedValue(requestScopedConfig),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'body-scoped');

      expect(result).toBeNull();
      expect(deps.getCachedTools).not.toHaveBeenCalled();
    });

    it('uses a provided serverConfig without calling the resolver', async () => {
      const deps = createMockDeps({
        getCachedTools: jest.fn().mockResolvedValue(cachedTools),
      });
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'body-scoped', requestScopedConfig);

      expect(result).toBeNull();
      expect(deps.getServerConfig).not.toHaveBeenCalled();
      expect(deps.getCachedTools).not.toHaveBeenCalled();
    });

    it('returns null when the cache is empty', async () => {
      const deps = createMockDeps();
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'brave');

      expect(result).toBeNull();
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
      const { getMCPServerTools } = createMCPToolCacheService(deps);

      const result = await getMCPServerTools('u1', 'brave');

      expect(result).toBeNull();
    });
  });
});
