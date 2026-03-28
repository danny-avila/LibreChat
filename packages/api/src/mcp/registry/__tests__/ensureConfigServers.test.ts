import type * as t from '~/mcp/types';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';
import { MCPServerInspector } from '~/mcp/registry/MCPServerInspector';

jest.mock('~/mcp/registry/MCPServerInspector');
jest.mock('~/mcp/registry/db/ServerConfigsDB', () => ({
  ServerConfigsDB: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(undefined),
    getAll: jest.fn().mockResolvedValue({}),
    add: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
  })),
}));

const FIXED_TIME = 1699564800000;

const mockMongoose = {} as typeof import('mongoose');

const sseConfig: t.MCPOptions = {
  type: 'sse',
  url: 'https://mcp.example.com/sse',
} as unknown as t.MCPOptions;

const altSseConfig: t.MCPOptions = {
  type: 'sse',
  url: 'https://mcp.other-tenant.com/sse',
} as unknown as t.MCPOptions;

const yamlConfig: t.MCPOptions = {
  type: 'stdio',
  command: 'node',
  args: ['tools.js'],
} as unknown as t.MCPOptions;

function makeParsedConfig(overrides: Partial<t.ParsedServerConfig> = {}): t.ParsedServerConfig {
  return {
    type: 'sse',
    url: 'https://mcp.example.com/sse',
    requiresOAuth: false,
    tools: 'tool_a, tool_b',
    capabilities: '{}',
    initDuration: 42,
    ...overrides,
  } as unknown as t.ParsedServerConfig;
}

describe('MCPServersRegistry — ensureConfigServers', () => {
  let registry: MCPServersRegistry;
  let inspectSpy: jest.SpyInstance;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(FIXED_TIME));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    (MCPServersRegistry as unknown as { instance: undefined }).instance = undefined;
    MCPServersRegistry.createInstance(mockMongoose);
    registry = MCPServersRegistry.getInstance();

    inspectSpy = jest
      .spyOn(MCPServerInspector, 'inspect')
      .mockImplementation(async (_serverName: string, rawConfig: t.MCPOptions) =>
        makeParsedConfig(rawConfig as unknown as Partial<t.ParsedServerConfig>),
      );

    await registry.reset();
  });

  afterEach(() => {
    inspectSpy.mockClear();
  });

  it('should return empty for empty input', async () => {
    expect(await registry.ensureConfigServers({})).toEqual({});
  });

  it('should return empty for null/undefined input', async () => {
    expect(
      await registry.ensureConfigServers(null as unknown as Record<string, t.MCPOptions>),
    ).toEqual({});
    expect(
      await registry.ensureConfigServers(undefined as unknown as Record<string, t.MCPOptions>),
    ).toEqual({});
  });

  it('should exclude YAML servers from config-source detection', async () => {
    await registry.addServer('yaml_server', yamlConfig, 'CACHE');

    const result = await registry.ensureConfigServers({
      yaml_server: yamlConfig,
      config_server: sseConfig,
    });

    expect(result).toHaveProperty('config_server');
    expect(result).not.toHaveProperty('yaml_server');
  });

  it('should return empty when all servers are YAML', async () => {
    await registry.addServer('yaml_a', yamlConfig, 'CACHE');
    await registry.addServer('yaml_b', yamlConfig, 'CACHE');
    inspectSpy.mockClear();

    const result = await registry.ensureConfigServers({
      yaml_a: yamlConfig,
      yaml_b: yamlConfig,
    });

    expect(result).toEqual({});
    expect(inspectSpy).not.toHaveBeenCalled();
  });

  it('should lazy-initialize a config-source server and tag source as config', async () => {
    const result = await registry.ensureConfigServers({ my_server: sseConfig });

    expect(result).toHaveProperty('my_server');
    expect(result.my_server.source).toBe('config');
    expect(inspectSpy).toHaveBeenCalledTimes(1);
    expect(inspectSpy).toHaveBeenCalledWith('my_server', sseConfig, undefined, undefined);
  });

  it('should return cached result on second call without re-inspecting', async () => {
    await registry.ensureConfigServers({ my_server: sseConfig });
    expect(inspectSpy).toHaveBeenCalledTimes(1);

    const result2 = await registry.ensureConfigServers({ my_server: sseConfig });
    expect(result2).toHaveProperty('my_server');
    expect(result2.my_server.source).toBe('config');
    expect(inspectSpy).toHaveBeenCalledTimes(1);
  });

  it('should store inspectionFailed stub on inspection failure', async () => {
    inspectSpy.mockRejectedValueOnce(new Error('connection refused'));

    const result = await registry.ensureConfigServers({ bad_server: sseConfig });

    expect(result).toHaveProperty('bad_server');
    expect(result.bad_server.inspectionFailed).toBe(true);
    expect(result.bad_server.source).toBe('config');
  });

  it('should return stub from cache on repeated failure without re-inspecting', async () => {
    inspectSpy.mockRejectedValueOnce(new Error('connection refused'));
    await registry.ensureConfigServers({ bad_server: sseConfig });
    expect(inspectSpy).toHaveBeenCalledTimes(1);

    const result2 = await registry.ensureConfigServers({ bad_server: sseConfig });
    expect(result2.bad_server.inspectionFailed).toBe(true);
    expect(inspectSpy).toHaveBeenCalledTimes(1);
  });

  it('should retry stale failure stub after CONFIG_STUB_RETRY_MS', async () => {
    inspectSpy.mockRejectedValueOnce(new Error('transient DNS failure'));
    await registry.ensureConfigServers({ flaky_server: sseConfig });
    expect(inspectSpy).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date(FIXED_TIME + 6 * 60 * 1000));

    const result = await registry.ensureConfigServers({ flaky_server: sseConfig });
    expect(inspectSpy).toHaveBeenCalledTimes(2);
    expect(result.flaky_server.inspectionFailed).toBeUndefined();
    expect(result.flaky_server.source).toBe('config');

    jest.setSystemTime(new Date(FIXED_TIME));
  });

  describe('cross-tenant isolation', () => {
    it('should use different cache keys for same server name with different configs', async () => {
      inspectSpy.mockClear();
      const resultA = await registry.ensureConfigServers({ shared_name: sseConfig });
      expect(resultA.shared_name.source).toBe('config');
      expect(inspectSpy).toHaveBeenCalledTimes(1);

      const resultB = await registry.ensureConfigServers({ shared_name: altSseConfig });
      expect(resultB.shared_name.source).toBe('config');
      expect(inspectSpy).toHaveBeenCalledTimes(2);
    });

    it('should return tenant-A config for tenant-A and tenant-B config for tenant-B', async () => {
      const resultA = await registry.ensureConfigServers({ srv: sseConfig });
      const resultB = await registry.ensureConfigServers({ srv: altSseConfig });

      expect((resultA.srv as unknown as { url: string }).url).toBe('https://mcp.example.com/sse');
      expect((resultB.srv as unknown as { url: string }).url).toBe(
        'https://mcp.other-tenant.com/sse',
      );
    });
  });

  describe('concurrent deduplication', () => {
    it('should only inspect once for multiple parallel calls with the same config', async () => {
      inspectSpy.mockClear();
      // Fire two calls simultaneously — both see cache miss, but only one should inspect
      const [r1, r2] = await Promise.all([
        registry.ensureConfigServers({ dedup_srv: sseConfig }),
        registry.ensureConfigServers({ dedup_srv: sseConfig }),
      ]);

      expect(r1.dedup_srv).toBeDefined();
      expect(r2.dedup_srv).toBeDefined();
      expect(inspectSpy).toHaveBeenCalledTimes(1);

      // Subsequent call must NOT re-inspect (cached)
      inspectSpy.mockClear();
      await registry.ensureConfigServers({ dedup_srv: sseConfig });
      expect(inspectSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe('merge order', () => {
    it('should merge YAML → config → user with correct precedence in getAllServerConfigs', async () => {
      await registry.addServer('yaml_srv', yamlConfig, 'CACHE');

      const configServers = await registry.ensureConfigServers({ config_srv: sseConfig });

      const all = await registry.getAllServerConfigs(undefined, configServers);
      expect(all).toHaveProperty('yaml_srv');
      expect(all).toHaveProperty('config_srv');
      expect(all.yaml_srv.source).toBe('yaml');
      expect(all.config_srv.source).toBe('config');
    });

    it('should let config servers appear alongside user DB servers', async () => {
      const mockDbConfigs = {
        user_srv: makeParsedConfig({ source: 'user', dbId: 'abc123' }),
      };
      jest.spyOn(registry['dbConfigsRepo'], 'getAll').mockResolvedValue(mockDbConfigs);

      const configServers = await registry.ensureConfigServers({ config_srv: sseConfig });
      const all = await registry.getAllServerConfigs('user-1', configServers);

      expect(all).toHaveProperty('config_srv');
      expect(all).toHaveProperty('user_srv');
      expect(all.config_srv.source).toBe('config');
      expect(all.user_srv.source).toBe('user');
    });
  });

  describe('invalidateConfigCache', () => {
    it('should clear config cache and force re-inspection on next call', async () => {
      await registry.ensureConfigServers({ my_server: sseConfig });
      inspectSpy.mockClear();

      await registry.invalidateConfigCache();

      await registry.ensureConfigServers({ my_server: sseConfig });
      expect(inspectSpy).toHaveBeenCalledTimes(1);
    });

    it('should return evicted server names', async () => {
      await registry.ensureConfigServers({ srv_a: sseConfig, srv_b: altSseConfig });
      const evicted = await registry.invalidateConfigCache();
      expect(evicted.length).toBeGreaterThan(0);
    });

    it('should return empty array when nothing is cached', async () => {
      const evicted = await registry.invalidateConfigCache();
      expect(evicted).toEqual([]);
    });
  });

  describe('getServerConfig with configServers', () => {
    it('should return config-source server when configServers is passed', async () => {
      const configServers = await registry.ensureConfigServers({ config_srv: sseConfig });
      const config = await registry.getServerConfig('config_srv', undefined, configServers);
      expect(config).toBeDefined();
      expect(config?.source).toBe('config');
    });

    it('should return config-source server with userId when configServers is passed', async () => {
      const configServers = await registry.ensureConfigServers({ config_srv: sseConfig });
      const config = await registry.getServerConfig('config_srv', 'user-123', configServers);
      expect(config).toBeDefined();
      expect(config?.source).toBe('config');
    });

    it('should return undefined for config-source server without configServers (tenant isolation)', async () => {
      await registry.ensureConfigServers({ config_srv: sseConfig });
      const config = await registry.getServerConfig('config_srv');
      expect(config).toBeUndefined();
    });

    it('should return correct config after invalidation and re-init', async () => {
      const configServers1 = await registry.ensureConfigServers({ config_srv: sseConfig });
      expect(await registry.getServerConfig('config_srv', undefined, configServers1)).toBeDefined();

      await registry.invalidateConfigCache();

      const configServers2 = await registry.ensureConfigServers({ config_srv: sseConfig });
      const config = await registry.getServerConfig('config_srv', undefined, configServers2);
      expect(config).toBeDefined();
      expect(config?.source).toBe('config');
    });

    it('should not cross-contaminate between tenant configServers maps', async () => {
      const tenantA = await registry.ensureConfigServers({ srv: sseConfig });
      const tenantB = await registry.ensureConfigServers({ srv: altSseConfig });

      const configA = await registry.getServerConfig('srv', undefined, tenantA);
      const configB = await registry.getServerConfig('srv', undefined, tenantB);

      expect((configA as unknown as { url: string }).url).toBe('https://mcp.example.com/sse');
      expect((configB as unknown as { url: string }).url).toBe('https://mcp.other-tenant.com/sse');
    });
  });

  describe('source tagging', () => {
    it('should tag CACHE-stored servers as yaml', async () => {
      await registry.addServer('yaml_srv', yamlConfig, 'CACHE');
      const config = await registry.getServerConfig('yaml_srv');
      expect(config?.source).toBe('yaml');
    });

    it('should tag stubs as yaml when stored in CACHE', async () => {
      await registry.addServerStub('stub_srv', yamlConfig, 'CACHE');
      const config = await registry.getServerConfig('stub_srv');
      expect(config?.source).toBe('yaml');
      expect(config?.inspectionFailed).toBe(true);
    });
  });
});
