import { logger } from '@librechat/data-schemas';
import type { IServerConfigsRepositoryInterface } from './ServerConfigsRepositoryInterface';
import type * as t from '~/mcp/types';
import { ServerConfigsCacheFactory } from './cache/ServerConfigsCacheFactory';
import { MCPServerInspector } from './MCPServerInspector';
import { ServerConfigsDB } from './db/ServerConfigsDB';

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

  constructor(mongoose: typeof import('mongoose')) {
    this.dbConfigsRepo = new ServerConfigsDB(mongoose);
    this.cacheConfigsRepo = ServerConfigsCacheFactory.create('App', false);
  }

  /** Creates and initializes the singleton MCPServersRegistry instance */
  public static createInstance(mongoose: typeof import('mongoose')): MCPServersRegistry {
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
    MCPServersRegistry.instance = new MCPServersRegistry(mongoose);
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
    // First we check if any config exist with the cache
    // Yaml config are pre loaded to the cache
    const configFromCache = await this.cacheConfigsRepo.get(serverName);
    if (configFromCache) return configFromCache;
    const configFromDB = await this.dbConfigsRepo.get(serverName, userId);
    if (configFromDB) return configFromDB;
    return undefined;
  }

  public async getAllServerConfigs(userId?: string): Promise<Record<string, t.ParsedServerConfig>> {
    return {
      ...(await this.cacheConfigsRepo.getAll()),
      ...(await this.dbConfigsRepo.getAll(userId)),
    };
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
      parsedConfig = await MCPServerInspector.inspect(serverName, config);
    } catch (error) {
      logger.error(`[MCPServersRegistry] Failed to inspect server "${serverName}":`, error);
      throw new Error(`MCP_INSPECTION_FAILED: Failed to connect to MCP server "${serverName}"`);
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
      parsedConfig = await MCPServerInspector.inspect(serverName, configForInspection);
    } catch (error) {
      logger.error(`[MCPServersRegistry] Failed to inspect server "${serverName}":`, error);
      throw new Error(`MCP_INSPECTION_FAILED: Failed to connect to MCP server "${serverName}"`);
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
}
