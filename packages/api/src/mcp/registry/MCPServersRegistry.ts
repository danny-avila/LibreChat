import { Keyv } from 'keyv';
import { logger } from '@librechat/data-schemas';
import type { IServerConfigsRepositoryInterface } from './ServerConfigsRepositoryInterface';
import type * as t from '~/mcp/types';
import { ServerConfigsCacheFactory, APP_CACHE_NAMESPACE } from './cache/ServerConfigsCacheFactory';
import { MCPInspectionFailedError, isMCPDomainNotAllowedError } from '~/mcp/errors';
import { MCPServerInspector } from './MCPServerInspector';
import { ServerConfigsDB } from './db/ServerConfigsDB';
import { cacheConfig } from '~/cache/cacheConfig';
import { withTimeout } from '~/utils';

/** Namespace for config-override MCP server inspection results (admin-defined via Config collection). */
const CONFIG_CACHE_NAMESPACE = 'Config' as const;

const CONFIG_SERVER_INIT_TIMEOUT_MS =
  process.env.MCP_INIT_TIMEOUT_MS != null ? parseInt(process.env.MCP_INIT_TIMEOUT_MS) : 30_000;

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

  public async getServerConfig(
    serverName: string,
    userId?: string,
  ): Promise<t.ParsedServerConfig | undefined> {
    const cacheKey = this.getReadThroughCacheKey(serverName, userId);

    if (await this.readThroughCache.has(cacheKey)) {
      return await this.readThroughCache.get(cacheKey);
    }

    // Check YAML cache first (boot-time initialized)
    const configFromYaml = await this.cacheConfigsRepo.get(serverName);
    if (configFromYaml) {
      await this.readThroughCache.set(cacheKey, configFromYaml);
      return configFromYaml;
    }

    // Check config-source cache (lazily initialized from admin Config overrides)
    const configFromOverride = await this.configCacheRepo.get(serverName);
    if (configFromOverride) {
      await this.readThroughCache.set(cacheKey, configFromOverride);
      return configFromOverride;
    }

    // Check DB (user-provided servers)
    const configFromDB = await this.dbConfigsRepo.get(serverName, userId);
    await this.readThroughCache.set(cacheKey, configFromDB);
    return configFromDB;
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
    // When config servers are provided, skip the read-through cache (it doesn't account for them)
    if (configServers && Object.keys(configServers).length > 0) {
      return this.fetchAllServerConfigsWithConfigServers(userId, configServers);
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

  private async fetchAllServerConfigsWithConfigServers(
    userId?: string,
    configServers?: Record<string, t.ParsedServerConfig>,
  ): Promise<Record<string, t.ParsedServerConfig>> {
    return {
      ...(await this.cacheConfigsRepo.getAll()),
      ...(configServers ?? {}),
      ...(await this.dbConfigsRepo.getAll(userId)),
    };
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
      // Preserve domain-specific error for better error handling
      if (isMCPDomainNotAllowedError(error)) {
        throw error;
      }
      throw new MCPInspectionFailedError(serverName, error as Error);
    }
    // Tag source based on storage location — CACHE = YAML boot-time, DB = user-provided
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
      // Preserve domain-specific error for better error handling
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
   *
   * Compares the resolved `mcpConfig` (which includes YAML + Config override servers)
   * against the YAML-only cache to identify config-source servers. Lazily initializes
   * any that aren't yet in the config cache.
   *
   * @param resolvedMcpConfig - The merged mcpConfig from `getAppConfig()` (YAML + overrides)
   * @returns Parsed configs for all config-source servers (already initialized or newly initialized)
   */
  public async ensureConfigServers(
    resolvedMcpConfig: Record<string, t.MCPOptions>,
  ): Promise<Record<string, t.ParsedServerConfig>> {
    if (!resolvedMcpConfig || Object.keys(resolvedMcpConfig).length === 0) {
      return {};
    }

    // Identify which servers are from config overrides (not YAML)
    const yamlConfigs = await this.cacheConfigsRepo.getAll();
    const yamlNames = new Set(Object.keys(yamlConfigs));

    const configServerEntries = Object.entries(resolvedMcpConfig).filter(
      ([name]) => !yamlNames.has(name),
    );

    if (configServerEntries.length === 0) {
      return {};
    }

    const result: Record<string, t.ParsedServerConfig> = {};

    await Promise.allSettled(
      configServerEntries.map(async ([serverName, rawConfig]) => {
        try {
          const parsed = await this.ensureSingleConfigServer(serverName, rawConfig);
          if (parsed) {
            result[serverName] = parsed;
          }
        } catch (error) {
          logger.error(
            `[MCPServersRegistry] Failed to ensure config server "${serverName}":`,
            error,
          );
        }
      }),
    );

    return result;
  }

  /**
   * Ensures a single config-source server is initialized.
   * Checks the config cache first; if missing, lazily inspects and caches the result.
   * Deduplicates concurrent init requests for the same server.
   */
  private async ensureSingleConfigServer(
    serverName: string,
    rawConfig: t.MCPOptions,
  ): Promise<t.ParsedServerConfig | undefined> {
    // Check config cache first
    const cached = await this.configCacheRepo.get(serverName);
    if (cached) {
      return cached;
    }

    // Deduplicate concurrent init requests
    const pending = this.pendingConfigInits.get(serverName);
    if (pending) {
      return pending;
    }

    const initPromise = this.lazyInitConfigServer(serverName, rawConfig);
    this.pendingConfigInits.set(serverName, initPromise);

    try {
      return await initPromise;
    } finally {
      this.pendingConfigInits.delete(serverName);
    }
  }

  /**
   * Lazily initializes a config-source MCP server: inspects capabilities/tools, then
   * stores the parsed config in the config cache with `source: 'config'`.
   */
  private async lazyInitConfigServer(
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
      await this.configCacheRepo.add(serverName, parsedConfig);

      logger.info(
        `${prefix} Initialized: tools=${parsedConfig.tools ?? 'N/A'}, ` +
          `duration=${parsedConfig.initDuration ?? 'N/A'}ms`,
      );
      return parsedConfig;
    } catch (error) {
      logger.error(`${prefix} Failed to initialize:`, error);

      // Store a stub so we don't retry on every request
      try {
        const stubConfig: t.ParsedServerConfig = {
          ...rawConfig,
          inspectionFailed: true,
          source: 'config',
        };
        await this.configCacheRepo.add(serverName, stubConfig);
        logger.info(`${prefix} Stored stub config for recovery`);
        return stubConfig;
      } catch (stubError) {
        logger.error(`${prefix} Failed to store stub config:`, stubError);
      }
      return undefined;
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
    const evicted = Object.keys(await this.configCacheRepo.getAll());
    await this.configCacheRepo.reset();
    await this.readThroughCache.clear();
    await this.readThroughCacheAll.clear();
    if (evicted.length > 0) {
      logger.info(
        `[MCPServersRegistry] Config server cache invalidated, evicted: ${evicted.join(', ')}`,
      );
    }
    return evicted;
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
}
