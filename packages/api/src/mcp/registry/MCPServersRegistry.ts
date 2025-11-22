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
 * Falls back to raw config when servers haven't been initialized yet or failed to initialize.
 * Handles server lifecycle operations including adding, removing, and querying configurations.
 */
class MCPServersRegistry {
  public readonly sharedAppServers = ServerConfigsCacheFactory.create('App', false);
  public readonly sharedUserServers = ServerConfigsCacheFactory.create('User', false);
  private readonly privateUserServers: Map<string | undefined, ServerConfigsCache> = new Map();
  private rawConfigs: t.MCPServers = {};

  /**
   * Stores the raw MCP configuration as a fallback when servers haven't been initialized yet.
   * Should be called during initialization before inspecting servers.
   */
  public setRawConfigs(configs: t.MCPServers): void {
    this.rawConfigs = configs;
  }

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

    /** Fallback to raw config if server hasn't been initialized yet */
    const rawConfig = this.rawConfigs[serverName];
    if (rawConfig) return rawConfig as t.ParsedServerConfig;

    return undefined;
  }

  public async getAllServerConfigs(userId?: string): Promise<Record<string, t.ParsedServerConfig>> {
    const registryConfigs = {
      ...(await this.sharedAppServers.getAll()),
      ...(await this.sharedUserServers.getAll()),
      ...((await this.privateUserServers.get(userId)?.getAll()) ?? {}),
    };

    /** Include all raw configs, but registry configs take precedence (they have inspection data) */
    const allConfigs: Record<string, t.ParsedServerConfig> = {};
    for (const serverName in this.rawConfigs) {
      allConfigs[serverName] = this.rawConfigs[serverName] as t.ParsedServerConfig;
    }

    /** Override with registry configs where available (they have richer data) */
    for (const serverName in registryConfigs) {
      allConfigs[serverName] = registryConfigs[serverName];
    }

    return allConfigs;
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
