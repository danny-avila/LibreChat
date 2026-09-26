import type { TCustomConfig } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import {
  createConfigReloader,
  createConfigReloadReport,
  createConfigGenerationTracker,
} from './reload';
import { createAppConfigService } from './service';
import { ConfigReloadError } from './loader';

class MemoryGenerationStore {
  private generation = 0;

  get = jest.fn(async (): Promise<string> => String(this.generation));

  incr = jest.fn(async (): Promise<number> => {
    this.generation += 1;
    return this.generation;
  });
}

function appConfig(config: TCustomConfig): AppConfig {
  return { config, endpoints: config.endpoints } as AppConfig;
}

function createReplica(
  source: { current: TCustomConfig },
  generation: ReturnType<typeof createConfigGenerationTracker>,
) {
  const entries = new Map<string, AppConfig>();
  const cache = {
    get: async (key: string) => entries.get(`APP_CONFIG:${key}`),
    set: async (key: string, value: unknown) => {
      entries.set(`APP_CONFIG:${key}`, value as AppConfig);
    },
    delete: async (key: string) => entries.delete(`APP_CONFIG:${key}`),
    opts: { store: { keys: () => entries.keys() } },
  };
  return createAppConfigService({
    loadBaseConfig: async () => appConfig(source.current),
    setCachedTools: async () => undefined,
    getCache: () => cache,
    cacheKeys: { APP_CONFIG: 'APP_CONFIG' },
    getApplicableConfigs: async () => [],
    getUserPrincipals: async () => [],
    syncConfigGeneration: generation.check,
  });
}

function customConfig(model: string): TCustomConfig {
  return {
    version: '1.2.1',
    endpoints: {
      custom: [
        {
          name: 'gateway',
          apiKey: 'user_provided',
          baseURL: 'https://example.com/v1',
          models: { default: [model], fetch: false },
        },
      ],
    },
  };
}

describe('config reload', () => {
  it('applies a custom endpoint model change on two replicas through one generation bump', async () => {
    const source = { current: customConfig('old-model') };
    const store = new MemoryGenerationStore();
    const generationA = createConfigGenerationTracker(store, { pollIntervalMs: 0 });
    const generationB = createConfigGenerationTracker(store, { pollIntervalMs: 0 });
    const replicaA = createReplica(source, generationA);
    const replicaB = createReplica(source, generationB);

    await Promise.all([
      replicaA.getAppConfig({ baseOnly: true }),
      replicaB.getAppConfig({ baseOnly: true }),
    ]);
    source.current = customConfig('new-model');

    const reload = createConfigReloader({
      loadConfig: async () => source.current,
      buildBaseConfig: async (config) => appConfig(config),
      getBaseConfig: () => replicaA.getAppConfig({ baseOnly: true }),
      replaceBaseConfig: replicaA.replaceBaseConfig,
      clearOverrideCache: () => replicaA.clearOverrideCache(),
      generation: generationA,
    });
    const result = await reload();

    const [configA, configB] = await Promise.all([
      replicaA.getAppConfig({ baseOnly: true }),
      replicaB.getAppConfig({ baseOnly: true }),
    ]);
    expect(result).toMatchObject({ scope: 'cluster', distributed: true, generation: 1 });
    expect(configA.config?.endpoints?.custom?.[0].models?.default).toEqual(['new-model']);
    expect(configB.config?.endpoints?.custom?.[0].models?.default).toEqual(['new-model']);
    expect(store.incr).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid config without changing the base config or generation', async () => {
    const replaceBaseConfig = jest.fn();
    const clearOverrideCache = jest.fn();
    const generation = {
      distributed: true,
      check: jest.fn().mockResolvedValue(undefined),
      bump: jest.fn(),
    };
    const reload = createConfigReloader({
      loadConfig: jest
        .fn()
        .mockRejectedValue(
          new ConfigReloadError('Invalid custom config', undefined, [
            { code: 'custom', path: ['endpoints'], message: 'Invalid endpoints' },
          ]),
        ),
      buildBaseConfig: jest.fn(),
      getBaseConfig: jest.fn().mockResolvedValue(appConfig(customConfig('old-model'))),
      replaceBaseConfig,
      clearOverrideCache,
      generation,
    });

    await expect(reload()).rejects.toMatchObject({
      name: 'ConfigReloadError',
      validationErrors: [{ message: 'Invalid endpoints' }],
    });
    expect(replaceBaseConfig).not.toHaveBeenCalled();
    expect(clearOverrideCache).not.toHaveBeenCalled();
    expect(generation.bump).not.toHaveBeenCalled();
  });

  it('retries a failed generation bump when the local config is already current', async () => {
    let current = appConfig(customConfig('old-model'));
    const candidate = customConfig('new-model');
    const replaceBaseConfig = jest.fn(async (config: AppConfig) => {
      current = config;
      return config;
    });
    const generation = {
      distributed: true,
      check: jest.fn().mockResolvedValue(undefined),
      bump: jest
        .fn()
        .mockRejectedValueOnce(new Error('Redis unavailable'))
        .mockResolvedValueOnce(1),
    };
    const reload = createConfigReloader({
      loadConfig: async () => candidate,
      buildBaseConfig: async (config) => appConfig(config),
      getBaseConfig: async () => current,
      replaceBaseConfig,
      clearOverrideCache: async () => undefined,
      generation,
    });

    await expect(reload()).resolves.toMatchObject({
      scope: 'local',
      propagationError: 'Redis generation update failed',
    });
    await expect(reload()).resolves.toMatchObject({
      scope: 'cluster',
      generation: 1,
    });
    expect(generation.bump).toHaveBeenCalledTimes(2);
    expect(replaceBaseConfig).toHaveBeenCalledTimes(1);
  });

  it('reports local-only scope when Redis is not configured', async () => {
    const previous = appConfig(customConfig('old-model'));
    const next = customConfig('new-model');
    const reload = createConfigReloader({
      loadConfig: async () => next,
      buildBaseConfig: async (config) => appConfig(config),
      getBaseConfig: async () => previous,
      replaceBaseConfig: async (config) => config,
      clearOverrideCache: async () => undefined,
      generation: createConfigGenerationTracker(),
    });

    await expect(reload()).resolves.toMatchObject({ scope: 'local', distributed: false });
  });

  it('restores the previous base when local override invalidation fails', async () => {
    const previous = appConfig(customConfig('old-model'));
    const replaceBaseConfig = jest.fn(async (config: AppConfig) => config);
    const generation = {
      distributed: true,
      check: jest.fn().mockResolvedValue(undefined),
      bump: jest.fn(),
    };
    const reload = createConfigReloader({
      loadConfig: async () => customConfig('new-model'),
      buildBaseConfig: async (config) => appConfig(config),
      getBaseConfig: async () => previous,
      replaceBaseConfig,
      clearOverrideCache: jest.fn().mockRejectedValue(new Error('cache failure')),
      generation,
    });

    await expect(reload()).rejects.toThrow('cache failure');
    expect(replaceBaseConfig).toHaveBeenCalledTimes(2);
    expect(replaceBaseConfig).toHaveBeenLastCalledWith(previous);
    expect(generation.bump).not.toHaveBeenCalled();
  });

  it('flags an MCP server edit as restart-required', () => {
    const previous: TCustomConfig = {
      version: '1.2.1',
      mcpServers: { docs: { type: 'streamable-http', url: 'https://old.example.com/mcp' } },
    };
    const next: TCustomConfig = {
      version: '1.2.1',
      mcpServers: { docs: { type: 'streamable-http', url: 'https://new.example.com/mcp' } },
    };

    expect(createConfigReloadReport(previous, next)).toContainEqual({
      section: 'mcpServers',
      status: 'restart_required',
      restartRequired: true,
      restartRequiredPaths: ['mcpServers.docs.url'],
    });
  });

  it('does not regress its generation when an older read resolves after a bump', async () => {
    const store = new MemoryGenerationStore();
    const tracker = createConfigGenerationTracker(store, { pollIntervalMs: 0 });
    await tracker.check();
    let resolveRead: ((generation: string) => void) | undefined;
    store.get.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveRead = resolve;
        }),
    );

    const staleCheck = tracker.check();
    await tracker.bump();
    resolveRead?.('0');

    await expect(staleCheck).resolves.toBeUndefined();
    await expect(tracker.check()).resolves.toBeUndefined();
  });

  it('retries a generation until a successful reload acknowledges it', async () => {
    const store = new MemoryGenerationStore();
    const tracker = createConfigGenerationTracker(store, { pollIntervalMs: 0 });
    await tracker.check();
    await store.incr();

    const failedAttempt = await tracker.check();
    const retry = await tracker.check();
    expect(failedAttempt).toBeDefined();
    expect(retry).toBeDefined();

    retry?.acknowledge();
    await expect(tracker.check()).resolves.toBeUndefined();
  });

  it('single-flights concurrent generation reads', async () => {
    const store = new MemoryGenerationStore();
    const tracker = createConfigGenerationTracker(store, { pollIntervalMs: 0 });

    await Promise.all([tracker.check(), tracker.check(), tracker.check()]);

    expect(store.get).toHaveBeenCalledTimes(1);
  });

  it('limits generation reads to one per poll interval', async () => {
    const store = new MemoryGenerationStore();
    let now = 1_000;
    const tracker = createConfigGenerationTracker(store, {
      pollIntervalMs: 1_000,
      now: () => now,
    });

    await tracker.check();
    await tracker.check();
    expect(store.get).toHaveBeenCalledTimes(1);

    now += 1_000;
    await tracker.check();
    expect(store.get).toHaveBeenCalledTimes(2);
  });
});
