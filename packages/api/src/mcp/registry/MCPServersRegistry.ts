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
  public readonly sharedAppServers = ServerConfigsCacheFactory.create('App', true);
  public readonly sharedUserServers = ServerConfigsCacheFactory.create('User', true);
  private readonly privateUserServers: Map<string | undefined, ServerConfigsCache> = new Map();

  public async addPrivateUserServer(
    userId: string,
    serverName: string,
    config: t.ParsedServerConfig,
  ): Promise<void> {
    if (!this.privateUserServers.has(userId)) {
      const cache = ServerConfigsCacheFactory.create(`User(${userId})`, false);
      this.privateUserServers.set(userId, cache);
    }
    await this.privateUserServers.get(userId)!.add(serverName, config);
  }

  public async updatePrivateUserServer(
    userId: string,
    serverName: string,
    config: t.ParsedServerConfig,
  ): Promise<void> {
    const userCache = this.privateUserServers.get(userId);
    if (!userCache) throw new Error(`No private servers found for user "${userId}".`);
    await userCache.update(serverName, config);
  }

  public async removePrivateUserServer(userId: string, serverName: string): Promise<void> {
    await this.privateUserServers.get(userId)?.remove(serverName);
  }

  public async getServerConfig(
    serverName: string,
    userId?: string,
  ): Promise<t.ParsedServerConfig | undefined> {
    const sharedAppServer = await this.sharedAppServers.get(serverName);
    if (sharedAppServer) return sharedAppServer;

    const sharedUserServer = await this.sharedUserServers.get(serverName);
    if (sharedUserServer) return sharedUserServer;

    const privateUserServer = await this.privateUserServers.get(userId)?.get(serverName);
    if (privateUserServer) return privateUserServer;

    return undefined;
  }

  public async getAllServerConfigs(userId?: string): Promise<Record<string, t.ParsedServerConfig>> {
    return {
      ...(await this.sharedAppServers.getAll()),
      ...(await this.sharedUserServers.getAll()),
      ...((await this.privateUserServers.get(userId)?.getAll()) ?? {}),
    };
  }

  // TODO: This is currently used to determine if a server requires OAuth. However, this info can
  // can be determined through config.requiresOAuth. Refactor usages and remove this method.
  public async getOAuthServers(userId?: string): Promise<Set<string>> {
    const allServers = await this.getAllServerConfigs(userId);
    const oauthServers = Object.entries(allServers).filter(([, config]) => config.requiresOAuth);
    return new Set(oauthServers.map(([name]) => name));
  }

  public async reset(): Promise<void> {
    await this.sharedAppServers.reset();
    await this.sharedUserServers.reset();
    for (const cache of this.privateUserServers.values()) {
      await cache.reset();
    }
    this.privateUserServers.clear();
  }
}

export const mcpServersRegistry = new MCPServersRegistry();
