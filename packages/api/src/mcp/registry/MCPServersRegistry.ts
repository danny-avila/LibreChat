import { Keyv } from 'keyv';
import { createHash } from 'crypto';
import { logger } from '@librechat/data-schemas';
import type { IServerConfigsRepositoryInterface } from './ServerConfigsRepositoryInterface';
import type * as t from '~/mcp/types';
import {
  ServerConfigsCacheFactory,
  APP_CACHE_NAMESPACE,
  CONFIG_CACHE_NAMESPACE,
} from './cache/ServerConfigsCacheFactory';
import { MCPInspectionFailedError, isMCPDomainNotAllowedError } from '~/mcp/errors';
import { MCPServerInspector } from './MCPServerInspector';
import { ServerConfigsDB } from './db/ServerConfigsDB';
import { cacheConfig } from '~/cache/cacheConfig';
import { withTimeout } from '~/utils';

/** How long a failure stub is considered fresh before re-attempting inspection (5 minutes). */
const CONFIG_STUB_RETRY_MS = 5 * 60 * 1000;

const CONFIG_SERVER_INIT_TIMEOUT_MS = (() => {
  const raw = process.env.MCP_INIT_TIMEOUT_MS;
  if (raw == null) {
    return 30_000;
  }
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
})();

/**
 * Central registry for managing MCP server configurations.
 * Authoritative source of truth for all MCP servers provided by LibreChat.
 *
 * Uses a three-layer architecture:
 * - YAML Cache (cacheConfigsRepo): Operator-defined configs loaded at startup (in-memory or Redis)
 * - Config Cache (configCacheRepo): Admin-defined configs from Config overrides, lazily initialized
 * - DB Repository (dbConfigsRepo): User-provided configs created at runtime (MongoDB + ACL)
 *
 * Query priority: YAML cache → Config cache → DB.
 */
export class MCPServersRegistry {
  private static instance: MCPServersRegistry;

  private readonly dbConfigsRepo: IServerConfigsRepositoryInterface;
  private readonly cacheConfigsRepo: IServerConfigsRepositoryInterface;
  private readonly configCacheRepo: IServerConfigsRepositoryInterface;
  private readonly allowedDomains?: string[] | null;
  private readonly readThroughCache: Keyv<t.ParsedServerConfig>;
  private readonly readThroughCacheAll: Keyv<Record<string, t.ParsedServerConfig>>;
  private readonly pendingGetAllPromises = new Map<
    string,
    Promise<Record<string, t.ParsedServerConfig>>
  >();

  /** Tracks in-flight config server initializations to prevent duplicate work. */
  private readonly pendingConfigInits = new Map<
    string,
    Promise<t.ParsedServerConfig | undefined>
  >();

  /** Memoized YAML server names — set once after boot-time init, never changes. */
  private yamlServerNames: Set<string> | null = null;
  private yamlServerNamesPromise: Promise<Set<string>> | null = null;

  constructor(mongoose: typeof import('mongoose'), allowedDomains?: string[] | null) {
    this.dbConfigsRepo = new ServerConfigsDB(mongoose);
    this.cacheConfigsRepo = ServerConfigsCacheFactory.create(APP_CACHE_NAMESPACE, false);
    this.configCacheRepo = ServerConfigsCacheFactory.create(CONFIG_CACHE_NAMESPACE, false);
    this.allowedDomains = allowedDomains;

    const ttl = cacheConfig.MCP_REGISTRY_CACHE_TTL;

    this.readThroughCache = new Keyv<t.ParsedServerConfig>({
      namespace: 'mcp-registry-read-through',
      ttl,
    });

    this.readThroughCacheAll = new Keyv<Record<string, t.ParsedServerConfig>>({
      namespace: 'mcp-registry-read-through-all',
      ttl,
    });
  }

  /** Creates and initializes the singleton MCPServersRegistry instance */
  public static createInstance(
    mongoose: typeof import('mongoose'),
    allowedDomains?: string[] | null,
  ): MCPServersRegistry {
    if (!mongoose) {
      throw new Error(
        'MCPServersRegistry creation failed: mongoose instance is required for database operations. ' +
          'Ensure mongoose is initialized before creating the registry.',
      );
    }
    if (MCPServersRegistry.instance) {
      logger.debug('[MCPServersRegistry] Returning existing instance');
      return MCPServersRegistry.instance;
    }
    logger.info('[MCPServersRegistry] Creating new instance');
    MCPServersRegistry.instance = new MCPServersRegistry(mongoose, allowedDomains);
    return MCPServersRegistry.instance;
  }

  /** Returns the singleton MCPServersRegistry instance */
  public static getInstance(): MCPServersRegistry {
    if (!MCPServersRegistry.instance) {
      throw new Error('MCPServersRegistry has not been initialized.');
    }
    return MCPServersRegistry.instance;
  }

  public getAllowedDomains(): string[] | null | undefined {
    return this.allowedDomains;
  }

  /** Returns true when no explicit allowedDomains allowlist is configured, enabling SSRF TOCTOU protection */
  public shouldEnableSSRFProtection(): boolean {
    return !Array.isArray(this.allowedDomains) || this.allowedDomains.length === 0;
  }

  /**
   * Returns the config for a single server. When `configServers` is provided, config-source
   * servers are resolved from it directly (no global state, no cross-tenant race).
   */
  public async getServerConfig(
    serverName: string,
    userId?: string,
    configServers?: Record<string, t.ParsedServerConfig>,
  ): Promise<t.ParsedServerConfig | undefined> {
    if (configServers?.[serverName]) {
      return configServers[serverName];
    }

    const cacheKey = this.getReadThroughCacheKey(serverName, userId);

    if (await this.readThroughCache.has(cacheKey)) {
      return await this.readThroughCache.get(cacheKey);
    }

    const configFromYaml = await this.cacheConfigsRepo.get(serverName);
    if (configFromYaml) {
      await this.readThroughCache.set(cacheKey, configFromYaml);
      return configFromYaml;
    }

    const configFromDB = await this.dbConfigsRepo.get(serverName, userId);
    await this.readThroughCache.set(cacheKey, configFromDB);
    return configFromDB;
  }

  /**
   * Returns all server configs visible to the given user.
   * YAML and Config tiers are mutually exclusive by design (`ensureConfigServers` filters
   * YAML names), so the spread order only matters for User DB (highest priority) overriding both.
   */
  public async getAllServerConfigs(
    userId?: string,
    configServers?: Record<string, t.ParsedServerConfig>,
  ): Promise<Record<string, t.ParsedServerConfig>> {
    if (configServers == null || !Object.keys(configServers).length) {
      return this.getBaseServerConfigs(userId);
    }
    const base = await this.getBaseServerConfigs(userId);
    return { ...configServers, ...base };
  }

  /**
   * Returns YAML + user-DB server configs, cached via `readThroughCacheAll`.
   * Always called by `getAllServerConfigs` so the DB query is amortized across
   * requests within the TTL window regardless of whether `configServers` is present.
   */
  private async getBaseServerConfigs(
    userId?: string,
  ): Promise<Record<string, t.ParsedServerConfig>> {
    const cacheKey = userId ?? '__no_user__';

    if (await this.readThroughCacheAll.has(cacheKey)) {
      return (await this.readThroughCacheAll.get(cacheKey)) ?? {};
    }

    const pending = this.pendingGetAllPromises.get(cacheKey);
    if (pending) {
      return pending;
    }

    const fetchPromise = this.fetchBaseServerConfigs(cacheKey, userId);
    this.pendingGetAllPromises.set(cacheKey, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      this.pendingGetAllPromises.delete(cacheKey);
    }
  }

  private async fetchBaseServerConfigs(
    cacheKey: string,
    userId?: string,
  ): Promise<Record<string, t.ParsedServerConfig>> {
    const result = {
      ...(await this.cacheConfigsRepo.getAll()),
      ...(await this.dbConfigsRepo.getAll(userId)),
    };

    await this.readThroughCacheAll.set(cacheKey, result);
    return result;
  }

  /**
   * Stores a minimal config stub so the server remains "known" to the registry
   * even when inspection fails at startup. This enables reinitialize to recover.
   */
  public async addServerStub(
    serverName: string,
    config: t.MCPOptions,
    storageLocation: 'CACHE' | 'DB',
    userId?: string,
  ): Promise<t.AddServerResult> {
    const configRepo = this.getConfigRepository(storageLocation);
    const source: t.MCPServerSource = storageLocation === 'CACHE' ? 'yaml' : 'user';
    const stubConfig: t.ParsedServerConfig = { ...config, inspectionFailed: true, source };
    const result = await configRepo.add(serverName, stubConfig, userId);
    await this.readThroughCache.delete(this.getReadThroughCacheKey(serverName, userId));
    await this.readThroughCache.delete(this.getReadThroughCacheKey(serverName));
    return result;
  }

  public async addServer(
    serverName: string,
    config: t.MCPOptions,
    storageLocation: 'CACHE' | 'DB',
    userId?: string,
  ): Promise<t.AddServerResult> {
    const configRepo = this.getConfigRepository(storageLocation);
    let parsedConfig: t.ParsedServerConfig;
    try {
      parsedConfig = await MCPServerInspector.inspect(
        serverName,
        config,
        undefined,
        this.allowedDomains,
      );
    } catch (error) {
      logger.error(`[MCPServersRegistry] Failed to inspect server "${serverName}":`, error);
      if (isMCPDomainNotAllowedError(error)) {
        throw error;
      }
      throw new MCPInspectionFailedError(serverName, error as Error);
    }
    const tagged = {
      ...parsedConfig,
      source: (storageLocation === 'CACHE' ? 'yaml' : 'user') as t.MCPServerSource,
    };
    return await configRepo.add(serverName, tagged, userId);
  }

  /**
   * Re-inspects a server that previously failed initialization.
   * Uses the stored stub config to attempt a full inspection and replaces the stub on success.
   */
  public async reinspectServer(
    serverName: string,
    storageLocation: 'CACHE' | 'DB',
    userId?: string,
  ): Promise<t.AddServerResult> {
    const configRepo = this.getConfigRepository(storageLocation);
    const existing = await configRepo.get(serverName, userId);
    if (!existing) {
      throw new Error(`Server "${serverName}" not found in ${storageLocation} for reinspection.`);
    }
    if (!existing.inspectionFailed) {
      throw new Error(
        `Server "${serverName}" is not in a failed state. Use updateServer() instead.`,
      );
    }

    const { inspectionFailed: _, ...configForInspection } = existing;
    let parsedConfig: t.ParsedServerConfig;
    try {
      parsedConfig = await MCPServerInspector.inspect(
        serverName,
        configForInspection,
        undefined,
        this.allowedDomains,
      );
    } catch (error) {
      logger.error(`[MCPServersRegistry] Reinspection failed for server "${serverName}":`, error);
      if (isMCPDomainNotAllowedError(error)) {
        throw error;
      }
      throw new MCPInspectionFailedError(serverName, error as Error);
    }

    const updatedConfig = { ...parsedConfig, updatedAt: Date.now() };
    await configRepo.update(serverName, updatedConfig, userId);
    await this.readThroughCache.delete(this.getReadThroughCacheKey(serverName, userId));
    await this.readThroughCache.delete(this.getReadThroughCacheKey(serverName));
    // Full clear required: getAllServerConfigs is keyed by userId with no reverse index to enumerate cached keys
    await this.readThroughCacheAll.clear();
    return { serverName, config: updatedConfig };
  }

  public async updateServer(
    serverName: string,
    config: t.MCPOptions,
    storageLocation: 'CACHE' | 'DB',
    userId?: string,
  ): Promise<t.ParsedServerConfig> {
    const configRepo = this.getConfigRepository(storageLocation);

    // Merge existing admin API key if not provided in update (needed for inspection)
    let configForInspection = { ...config };
    if (config.apiKey?.source === 'admin' && !config.apiKey?.key) {
      const existingConfig = await configRepo.get(serverName, userId);
      if (existingConfig?.apiKey?.key) {
        configForInspection = {
          ...configForInspection,
          apiKey: {
            ...configForInspection.apiKey!,
            key: existingConfig.apiKey.key,
          },
        };
      }
    }

    let parsedConfig: t.ParsedServerConfig;
    try {
      parsedConfig = await MCPServerInspector.inspect(
        serverName,
        configForInspection,
        undefined,
        this.allowedDomains,
      );
    } catch (error) {
      logger.error(`[MCPServersRegistry] Failed to inspect server "${serverName}":`, error);
      if (isMCPDomainNotAllowedError(error)) {
        throw error;
      }
      throw new MCPInspectionFailedError(serverName, error as Error);
    }
    await configRepo.update(serverName, parsedConfig, userId);
    return parsedConfig;
  }

  /**
   * Ensures that config-source MCP servers (from admin Config overrides) are initialized.
   * Identifies servers in `resolvedMcpConfig` that are not from YAML, lazily initializes
   * any not yet in the config cache, and returns their parsed configs.
   *
   * Config cache keys are scoped by a hash of the raw config to prevent cross-tenant
   * cache poisoning when two tenants define a server with the same name but different configs.
   */
  public async ensureConfigServers(
    resolvedMcpConfig: Record<string, t.MCPOptions>,
  ): Promise<Record<string, t.ParsedServerConfig>> {
    if (!resolvedMcpConfig || Object.keys(resolvedMcpConfig).length === 0) {
      return {};
    }

    const yamlNames = await this.getYamlServerNames();
    const configServerEntries = Object.entries(resolvedMcpConfig).filter(
      ([name]) => !yamlNames.has(name),
    );

    if (configServerEntries.length === 0) {
      return {};
    }

    const result: Record<string, t.ParsedServerConfig> = {};

    const settled = await Promise.allSettled(
      configServerEntries.map(async ([serverName, rawConfig]) => {
        const parsed = await this.ensureSingleConfigServer(serverName, rawConfig);
        if (parsed) {
          result[serverName] = parsed;
        }
      }),
    );
    for (const outcome of settled) {
      if (outcome.status === 'rejected') {
        logger.error('[MCPServersRegistry][ensureConfigServers] Unexpected error:', outcome.reason);
      }
    }

    return result;
  }

  /**
   * Ensures a single config-source server is initialized.
   * Cache key is scoped by config hash to prevent cross-tenant poisoning.
   * Deduplicates concurrent init requests for the same server+config.
   * Stale failure stubs are retried after `CONFIG_STUB_RETRY_MS` to recover from transient errors.
   */
  private async ensureSingleConfigServer(
    serverName: string,
    rawConfig: t.MCPOptions,
  ): Promise<t.ParsedServerConfig | undefined> {
    const cacheKey = this.configCacheKey(serverName, rawConfig);

    const cached = await this.configCacheRepo.get(cacheKey);
    if (cached) {
      const isStaleStub =
        cached.inspectionFailed && Date.now() - (cached.updatedAt ?? 0) > CONFIG_STUB_RETRY_MS;
      if (!isStaleStub) {
        return cached;
      }
      logger.info(`[MCP][config][${serverName}] Retrying stale failure stub`);
    }

    const pending = this.pendingConfigInits.get(cacheKey);
    if (pending) {
      return pending;
    }

    const initPromise = this.lazyInitConfigServer(cacheKey, serverName, rawConfig);
    this.pendingConfigInits.set(cacheKey, initPromise);

    try {
      return await initPromise;
    } finally {
      this.pendingConfigInits.delete(cacheKey);
    }
  }

  /**
   * Lazily initializes a config-source MCP server: inspects capabilities/tools, then
   * stores the parsed config in the config cache with `source: 'config'`.
   */
  private async lazyInitConfigServer(
    cacheKey: string,
    serverName: string,
    rawConfig: t.MCPOptions,
  ): Promise<t.ParsedServerConfig | undefined> {
    const prefix = `[MCP][config][${serverName}]`;
    logger.info(`${prefix} Lazy-initializing config-source server`);

    try {
      const inspected = await withTimeout(
        MCPServerInspector.inspect(serverName, rawConfig, undefined, this.allowedDomains),
        CONFIG_SERVER_INIT_TIMEOUT_MS,
        `${prefix} Server initialization timed out`,
      );

      const parsedConfig: t.ParsedServerConfig = { ...inspected, source: 'config' };
      await this.upsertConfigCache(cacheKey, parsedConfig);

      logger.info(
        `${prefix} Initialized: tools=${parsedConfig.tools ?? 'N/A'}, ` +
          `duration=${parsedConfig.initDuration ?? 'N/A'}ms`,
      );
      return parsedConfig;
    } catch (error) {
      logger.error(`${prefix} Failed to initialize:`, error);

      const stubConfig: t.ParsedServerConfig = {
        ...rawConfig,
        inspectionFailed: true,
        source: 'config',
        updatedAt: Date.now(),
      };
      try {
        await this.upsertConfigCache(cacheKey, stubConfig);
        logger.info(`${prefix} Stored stub config for recovery`);
      } catch (cacheError) {
        logger.error(
          `${prefix} Failed to store stub config (will retry on next request):`,
          cacheError,
        );
      }
      return stubConfig;
    }
  }

  /**
   * Writes a config to `configCacheRepo` using the atomic upsert operation.
   * Safe for cross-process races — the underlying cache handles add-or-update internally.
   */
  private async upsertConfigCache(cacheKey: string, config: t.ParsedServerConfig): Promise<void> {
    await this.configCacheRepo.upsert(cacheKey, config);
  }

  /**
   * Clears the config-source server cache, forcing re-inspection on next access.
   * Called when admin config overrides change (e.g., mcpServers mutation).
   *
   * @returns Names of servers that were evicted from the config cache.
   *          Callers should disconnect active connections for these servers.
   */
  public async invalidateConfigCache(): Promise<string[]> {
    const allCached = await this.configCacheRepo.getAll();
    const evictedNames = [
      ...new Set(
        Object.keys(allCached).map((key) => {
          const lastColon = key.lastIndexOf(':');
          return lastColon > 0 ? key.slice(0, lastColon) : key;
        }),
      ),
    ];

    await Promise.all([
      this.configCacheRepo.reset(),
      // Only clear readThroughCacheAll (merged results that may include stale config servers).
      // readThroughCache (individual YAML/user lookups) is unaffected by config mutations.
      this.readThroughCacheAll.clear(),
    ]);

    if (evictedNames.length > 0) {
      logger.info(
        `[MCPServersRegistry] Config server cache invalidated, evicted: ${evictedNames.join(', ')}`,
      );
    }
    return evictedNames;
  }

  // TODO: Refactor callers to use config.requiresOAuth directly instead of this method.
  // Known gap: config-source OAuth servers are not included here because callers
  // (OAuthReconnectionManager, UserController) lack request context to resolve configServers.
  // Config-source OAuth auto-reconnection and uninstall cleanup require a separate mechanism.
  public async getOAuthServers(userId?: string): Promise<Set<string>> {
    const allServers = await this.getAllServerConfigs(userId);
    const oauthServers = Object.entries(allServers).filter(([, config]) => config.requiresOAuth);
    return new Set(oauthServers.map(([name]) => name));
  }

  public async reset(): Promise<void> {
    await this.cacheConfigsRepo.reset();
    await this.configCacheRepo.reset();
    await this.readThroughCache.clear();
    await this.readThroughCacheAll.clear();
    this.yamlServerNames = null;
    this.yamlServerNamesPromise = null;
  }

  public async removeServer(
    serverName: string,
    storageLocation: 'CACHE' | 'DB',
    userId?: string,
  ): Promise<void> {
    const configRepo = this.getConfigRepository(storageLocation);
    await configRepo.remove(serverName, userId);
  }

  private getConfigRepository(storageLocation: 'CACHE' | 'DB'): IServerConfigsRepositoryInterface {
    switch (storageLocation) {
      case 'CACHE':
        return this.cacheConfigsRepo;
      case 'DB':
        return this.dbConfigsRepo;
      default:
        throw new Error(
          `MCPServersRegistry: The provided storage location "${storageLocation}" is not supported`,
        );
    }
  }

  private getReadThroughCacheKey(serverName: string, userId?: string): string {
    return userId ? `${serverName}::${userId}` : serverName;
  }

  /**
   * Returns memoized YAML server names. Populated lazily on first call after boot/reset.
   * YAML servers don't change after boot, so this avoids repeated `getAll()` calls.
   * Uses promise deduplication to prevent concurrent cold-start double-fetch.
   */
  private getYamlServerNames(): Promise<Set<string>> {
    if (this.yamlServerNames) {
      return Promise.resolve(this.yamlServerNames);
    }
    if (this.yamlServerNamesPromise) {
      return this.yamlServerNamesPromise;
    }
    this.yamlServerNamesPromise = this.cacheConfigsRepo
      .getAll()
      .then((configs) => {
        this.yamlServerNames = new Set(Object.keys(configs));
        this.yamlServerNamesPromise = null;
        return this.yamlServerNames;
      })
      .catch((err) => {
        this.yamlServerNamesPromise = null;
        throw err;
      });
    return this.yamlServerNamesPromise;
  }

  /**
   * Produces a config-cache key scoped by server name AND a hash of the raw config.
   * Prevents cross-tenant cache poisoning when two tenants define the same server name
   * with different configurations.
   */
  private configCacheKey(serverName: string, rawConfig: t.MCPOptions): string {
    const sorted = JSON.stringify(rawConfig, (_key, value: unknown) => {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        );
      }
      return value;
    });
    const hash = createHash('sha256').update(sorted).digest('hex').slice(0, 16);
    return `${serverName}:${hash}`;
  }
}
