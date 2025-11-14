import type * as t from '~/mcp/types';
import {
  ServerConfigsCacheFactory,
  type ServerConfigsCache,
} from './cache/ServerConfigsCacheFactory';

/**
 * Central registry for managing MCP server configurations across different scopes and users.
 * Maintains three categories of server configurations:
 * - Shared App Servers: Auto-started servers available to all users (initialized at startup)
 * - Shared User Servers: User-scope servers that require OAuth or on-demand startup
 * - Private User Servers: Per-user configurations dynamically added during runtime
 *
 * Provides a unified interface for retrieving server configs with proper fallback hierarchy:
 * checks shared app servers first, then shared user servers, then private user servers.
 * Handles server lifecycle operations including adding, removing, and querying configurations.
 */
class MCPServersRegistry {
  public readonly sharedAppServers = ServerConfigsCacheFactory.create('App', false); // changing to false to allow runtime updates when user shares an app with everyone. => initlizer takes care of race condition,
  public readonly sharedUserServers = ServerConfigsCacheFactory.create('User', false);
  private readonly privateUserServers: Map<string | undefined, ServerConfigsCache> = new Map();

  public async addPrivateUserServer(
    userId: string,
    serverName: string,
    config: t.ParsedServerConfig,
  ): Promise<void> {
    const userCache = this.getOrCreatePrivateUserCache(userId);
    await userCache.add(serverName, config);
  }

  public async updatePrivateUserServer(
    userId: string,
    serverName: string,
    config: t.ParsedServerConfig,
  ): Promise<void> {
    const userCache = this.getOrCreatePrivateUserCache(userId);
    await userCache.update(serverName, config);
  }

  public async removePrivateUserServer(userId: string, serverName: string): Promise<void> {
    const userCache = this.getOrCreatePrivateUserCache(userId);
    await userCache.remove(serverName);
  }

  public async getServerConfig(
    serverName: string,
    userId?: string,
  ): Promise<t.ParsedServerConfig | undefined> {
    const sharedAppServer = await this.sharedAppServers.get(serverName);
    if (sharedAppServer) return sharedAppServer;

    const sharedUserServer = await this.sharedUserServers.get(serverName);
    if (sharedUserServer) return sharedUserServer;

    if (userId) {
      const privateUserCache = this.getOrCreatePrivateUserCache(userId);
      const privateUserServer = await privateUserCache.get(serverName);
      if (privateUserServer) return privateUserServer;
    }

    return undefined;
  }

  public async getPrivateServerConfig(
    serverName: string,
    userId: string,
  ): Promise<t.ParsedServerConfig | undefined> {
    if (!userId) {
      throw new Error('userId is required for getPrivateServerConfig');
    }
    const userCache = this.getOrCreatePrivateUserCache(userId);
    return await userCache.get(serverName);
  }

  public async getAllServerConfigs(userId?: string): Promise<Record<string, t.ParsedServerConfig>> {
    const privateConfigs = userId ? await this.getOrCreatePrivateUserCache(userId).getAll() : {};

    return {
      ...(await this.sharedAppServers.getAll()),
      ...(await this.sharedUserServers.getAll()),
      ...privateConfigs,
    };
  }

  // TODO: This is currently used to determine if a server requires OAuth. However, this info can
  // can be determined through config.requiresOAuth. Refactor usages and remove this method.
  public async getOAuthServers(userId?: string): Promise<Set<string>> {
    const allServers = await this.getAllServerConfigs(userId);
    const oauthServers = Object.entries(allServers).filter(([, config]) => config.requiresOAuth);
    return new Set(oauthServers.map(([name]) => name));
  }

  /**
   * Add a shared server configuration.
   * Automatically routes to appropriate cache (app vs user) based on config properties.
   * - Servers requiring OAuth or with startup=false → sharedUserServers
   * - All other servers → sharedAppServers
   *
   * @param serverName - Name of the MCP server
   * @param config - Parsed server configuration
   */
  public async addSharedServer(serverName: string, config: t.ParsedServerConfig): Promise<void> {
    if (config.requiresOAuth || config.startup === false) {
      await this.sharedUserServers.add(serverName, config);
    } else {
      await this.sharedAppServers.add(serverName, config);
    }
  }

  public async reset(): Promise<void> {
    await this.sharedAppServers.reset();
    await this.sharedUserServers.reset();
    for (const cache of this.privateUserServers.values()) {
      await cache.reset();
    }
    this.privateUserServers.clear();
  }

  public async resetServer(serverName: string, userId?: string): Promise<void> {
    const cacheLocation = await this.getCurrentServerCacheLocation(serverName, userId);
    await cacheLocation.remove(serverName);
  }

  private async getCurrentServerCacheLocation(
    serverName: string,
    userId?: string,
  ): Promise<ServerConfigsCache> {
    const appServer = await this.sharedAppServers.get(serverName);
    if (appServer) {
      return this.sharedAppServers;
    }
    const userServer = await this.sharedUserServers.get(serverName);
    if (userServer) {
      return this.sharedUserServers;
    }
    if (userId) {
      const privateServerCache = this.getOrCreatePrivateUserCache(userId);
      if (await privateServerCache.get(serverName)) {
        return privateServerCache;
      }
    }
    throw new Error(`Server ${serverName} not found`);
  }

  /**
   * Lazy-loads private user cache instance.
   * In distributed environments, the cache instance may not exist in the local Map
   * even though data exists in Redis. This method ensures the cache instance is created
   * and connected to the correct Redis namespace.
   */
  private getOrCreatePrivateUserCache(userId: string): ServerConfigsCache {
    if (!this.privateUserServers.has(userId)) {
      const cache = ServerConfigsCacheFactory.create(`User(${userId})`, false);
      this.privateUserServers.set(userId, cache);
    }
    return this.privateUserServers.get(userId)!;
  }
}

export const mcpServersRegistry = new MCPServersRegistry();
