import { createHash } from 'crypto';
import { Keyv } from 'keyv';
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

    if (userId) {
      const serverOnlyKey = this.getReadThroughCacheKey(serverName);
      if (await this.readThroughCache.has(serverOnlyKey)) {
        return await this.readThroughCache.get(serverOnlyKey);
      }
    }

    const configFromYaml = await this.cacheConfigsRepo.get(serverName);
    if (configFromYaml) {
      await this.readThroughCache.set(cacheKey, configFromYaml);
      return configFromYaml;
    }

    const configFromConfigCache = await this.findInConfigCache(serverName);
    if (configFromConfigCache) {
      await this.readThroughCache.set(cacheKey, configFromConfigCache);
      return configFromConfigCache;
    }

    const configFromDB = await this.dbConfigsRepo.get(serverName, userId);
    await this.readThroughCache.set(cacheKey, configFromDB);
    return configFromDB;
  }

  /**
   * Scans configCacheRepo for any entry matching `${serverName}:*`.
   * This is the authoritative fallback when the readThroughCache TTL has expired.
   */
  private async findInConfigCache(serverName: string): Promise<t.ParsedServerConfig | undefined> {
    const allConfig = await this.configCacheRepo.getAll();
    const prefix = `${serverName}:`;
    for (const [key, val] of Object.entries(allConfig)) {
      if (key.startsWith(prefix)) {
        return val;
      }
    }
    return undefined;
  }

  /**
   * Returns all server configs visible to the given user.
   *
   * When `configServers` is provided (resolved config-source servers from `getAppConfig()`),
   * they are included in the merged result between YAML and user servers.
   * Merge order: YAML (lowest precedence) → Config overrides → User (highest precedence).
   *
   * @param userId - Optional user ID for scoping DB (user-provided) servers
   * @param configServers - Optional config-source servers already ensured via `ensureConfigServers()`
   */
  public async getAllServerConfigs(
    userId?: string,
    configServers?: Record<string, t.ParsedServerConfig>,
  ): Promise<Record<string, t.ParsedServerConfig>> {
    if (configServers && Object.keys(configServers).length > 0) {
      return {
        ...(await this.cacheConfigsRepo.getAll()),
        ...configServers,
        ...(await this.dbConfigsRepo.getAll(userId)),
      };
    }

    const cacheKey = userId ?? '__no_user__';

    if (await this.readThroughCacheAll.has(cacheKey)) {
      return (await this.readThroughCacheAll.get(cacheKey)) ?? {};
    }

    const pending = this.pendingGetAllPromises.get(cacheKey);
    if (pending) {
      return pending;
    }

    const fetchPromise = this.fetchAllServerConfigs(cacheKey, userId);
    this.pendingGetAllPromises.set(cacheKey, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      this.pendingGetAllPromises.delete(cacheKey);
    }
  }

  private async fetchAllServerConfigs(
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
    parsedConfig.source = storageLocation === 'CACHE' ? 'yaml' : 'user';
    return await configRepo.add(serverName, parsedConfig, userId);
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

    await Promise.allSettled(
      configServerEntries.map(async ([serverName, rawConfig]) => {
        const parsed = await this.ensureSingleConfigServer(serverName, rawConfig);
        if (parsed) {
          result[serverName] = parsed;
        }
      }),
    );

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

    const initPromise = (async () => {
      const result = await this.lazyInitConfigServer(cacheKey, serverName, rawConfig);
      if (result) {
        const rtKey = this.getReadThroughCacheKey(serverName);
        await this.readThroughCache.delete(rtKey);
        await this.readThroughCache.set(rtKey, result);
      }
      return result;
    })();
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
      const parsedConfig = await withTimeout(
        MCPServerInspector.inspect(serverName, rawConfig, undefined, this.allowedDomains),
        CONFIG_SERVER_INIT_TIMEOUT_MS,
        `${prefix} Server initialization timed out`,
        logger.error,
      );

      parsedConfig.source = 'config';
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
      };
      await this.upsertConfigCache(cacheKey, stubConfig);
      logger.info(`${prefix} Stored stub config for recovery`);
      return stubConfig;
    }
  }

  /**
   * Writes a config to `configCacheRepo`, using `add` for new entries and `update` for existing ones.
   * Handles cross-process races where another instance may have written the key first.
   */
  private async upsertConfigCache(cacheKey: string, config: t.ParsedServerConfig): Promise<void> {
    try {
      await this.configCacheRepo.add(cacheKey, config);
    } catch {
      try {
        await this.configCacheRepo.update(cacheKey, config);
      } catch {
        // Another process may have added+removed between our attempts — non-critical
      }
    }
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
      this.readThroughCache.clear(),
      this.readThroughCacheAll.clear(),
    ]);

    if (evictedNames.length > 0) {
      logger.info(
        `[MCPServersRegistry] Config server cache invalidated, evicted: ${evictedNames.join(', ')}`,
      );
    }
    return evictedNames;
  }

  // TODO: This is currently used to determine if a server requires OAuth. However, this info can
  // can be determined through config.requiresOAuth. Refactor usages and remove this method.
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
   */
  private async getYamlServerNames(): Promise<Set<string>> {
    if (this.yamlServerNames) {
      return this.yamlServerNames;
    }
    const yamlConfigs = await this.cacheConfigsRepo.getAll();
    this.yamlServerNames = new Set(Object.keys(yamlConfigs));
    return this.yamlServerNames;
  }

  /**
   * Produces a config-cache key scoped by server name AND a hash of the raw config.
   * Prevents cross-tenant cache poisoning when two tenants define the same server name
   * with different configurations.
   */
  private configCacheKey(serverName: string, rawConfig: t.MCPOptions): string {
    const hash = createHash('sha256').update(JSON.stringify(rawConfig)).digest('hex').slice(0, 8);
    return `${serverName}:${hash}`;
  }
}
