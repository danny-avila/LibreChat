import type * as t from '~/mcp/types';
import { ServerConfigsCacheFactory } from './cache/ServerConfigsCacheFactory';
import { MCPServerInspector } from './MCPServerInspector';
import { ServerConfigsDB } from './db/ServerConfigsDB';
import { IServerConfigsRepositoryInterface } from './ServerConfigsRepositoryInterface';

/**
 * Central registry for managing MCP server configurations across different scopes and users.
 * Authoritative source of truth for all MCP servers provided by LibreChat.
 *
 * Maintains three-tier cache structure:
 * - Shared App Servers: Auto-started servers available to all users (initialized at startup)
 * - Shared User Servers: User-scope servers that require OAuth or on-demand startup
 * - Private Servers: Per-user configurations dynamically added during runtime
 *
 * Provides a unified query interface with proper fallback hierarchy:
 * checks shared app servers first, then shared user servers, then private user servers.
 */
class MCPServersRegistry {
  private readonly dbConfigsRepo: IServerConfigsRepositoryInterface;
  private readonly cacheConfigsRepo: IServerConfigsRepositoryInterface;

  constructor() {
    this.dbConfigsRepo = new ServerConfigsDB();
    this.cacheConfigsRepo = ServerConfigsCacheFactory.create('App', 'Shared', false);
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
  ): Promise<t.ParsedServerConfig> {
    const configRepo = this.getConfigRepository(storageLocation);
    const parsedConfig = await MCPServerInspector.inspect(serverName, config);
    await configRepo.add(serverName, parsedConfig, userId);
    return parsedConfig;
  }

  public async updateServer(
    serverName: string,
    config: t.MCPOptions,
    storageLocation: 'CACHE' | 'DB',
    userId?: string,
  ): Promise<void> {
    const configRepo = this.getConfigRepository(storageLocation);
    const parsedConfig = await MCPServerInspector.inspect(serverName, config);
    await configRepo.update(serverName, parsedConfig, userId);
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
          `MCPServersRegistry.addServer: The provided storage location "${storageLocation}" is not supported`,
        );
    }
  }
}

export const mcpServersRegistry = new MCPServersRegistry();
