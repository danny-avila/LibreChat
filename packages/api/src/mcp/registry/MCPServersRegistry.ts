import { Keyv } from 'keyv';
import { logger } from '@librechat/data-schemas';
import type { IServerConfigsRepositoryInterface } from './ServerConfigsRepositoryInterface';
import type * as t from '~/mcp/types';
import { MCPInspectionFailedError, isMCPDomainNotAllowedError } from '~/mcp/errors';
import { ServerConfigsCacheFactory } from './cache/ServerConfigsCacheFactory';
import { MCPServerInspector } from './MCPServerInspector';
import { ServerConfigsDB } from './db/ServerConfigsDB';
import { cacheConfig } from '~/cache/cacheConfig';

/**
 * Central registry for managing MCP server configurations.
 * Authoritative source of truth for all MCP servers provided by LibreChat.
 *
 * Uses a two-repository architecture:
 * - Cache Repository: Stores YAML-defined configs loaded at startup (in-memory or Redis-backed)
 * - DB Repository: Stores dynamic configs created at runtime (not yet implemented)
 *
 * Query priority: Cache configs are checked first, then DB configs.
 */
export class MCPServersRegistry {
  private static instance: MCPServersRegistry;

  private readonly dbConfigsRepo: IServerConfigsRepositoryInterface;
  private readonly cacheConfigsRepo: IServerConfigsRepositoryInterface;
  private readonly allowedDomains?: string[] | null;
  private readonly readThroughCache: Keyv<t.ParsedServerConfig>;
  private readonly readThroughCacheAll: Keyv<Record<string, t.ParsedServerConfig>>;

  constructor(mongoose: typeof import('mongoose'), allowedDomains?: string[] | null) {
    this.dbConfigsRepo = new ServerConfigsDB(mongoose);
    this.cacheConfigsRepo = ServerConfigsCacheFactory.create('App', false);
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

  public async getServerConfig(
    serverName: string,
    userId?: string,
  ): Promise<t.ParsedServerConfig | undefined> {
    const cacheKey = this.getReadThroughCacheKey(serverName, userId);

    if (await this.readThroughCache.has(cacheKey)) {
      return await this.readThroughCache.get(cacheKey);
    }

    // First we check if any config exist with the cache
    // Yaml config are pre loaded to the cache
    const configFromCache = await this.cacheConfigsRepo.get(serverName);
    if (configFromCache) {
      await this.readThroughCache.set(cacheKey, configFromCache);
      return configFromCache;
    }

    const configFromDB = await this.dbConfigsRepo.get(serverName, userId);
    await this.readThroughCache.set(cacheKey, configFromDB);
    return configFromDB;
  }

  public async getAllServerConfigs(userId?: string): Promise<Record<string, t.ParsedServerConfig>> {
    const cacheKey = userId ?? '__no_user__';

    // Check if key exists in read-through cache
    if (await this.readThroughCacheAll.has(cacheKey)) {
      return (await this.readThroughCacheAll.get(cacheKey)) ?? {};
    }

    const result = {
      ...(await this.cacheConfigsRepo.getAll()),
      ...(await this.dbConfigsRepo.getAll(userId)),
    };

    await this.readThroughCacheAll.set(cacheKey, result);
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
    return await configRepo.add(serverName, parsedConfig, userId);
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

  // TODO: This is currently used to determine if a server requires OAuth. However, this info can
  // can be determined through config.requiresOAuth. Refactor usages and remove this method.
  public async getOAuthServers(userId?: string): Promise<Set<string>> {
    const allServers = await this.getAllServerConfigs(userId);
    const oauthServers = Object.entries(allServers).filter(([, config]) => config.requiresOAuth);
    return new Set(oauthServers.map(([name]) => name));
  }

  public async reset(): Promise<void> {
    await this.cacheConfigsRepo.reset();
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
