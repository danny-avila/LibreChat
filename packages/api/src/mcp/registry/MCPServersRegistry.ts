import type * as t from '~/mcp/types';
import {
  ServerConfigsCacheFactory,
  type ServerConfigsCache,
} from './cache/ServerConfigsCacheFactory';
import {
  PrivateServerConfigsCache,
  PrivateServerConfigsCacheFactory,
} from './cache/PrivateServerConfigs/PrivateServerConfigsCacheFactory';

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
  public readonly sharedAppServers: ServerConfigsCache = ServerConfigsCacheFactory.create(
    'App',
    'Shared',
    false,
  );

  public readonly sharedUserServers: ServerConfigsCache = ServerConfigsCacheFactory.create(
    'User',
    'Shared',
    false,
  );

  /**
   * Stores the raw MCP configuration as a fallback when servers haven't been initialized yet.
   * Should be called during initialization before inspecting servers.
   */
  public setRawConfigs(configs: t.MCPServers): void {
    this.rawConfigs = configs;
  }

  public readonly privateServersCache: PrivateServerConfigsCache =
    PrivateServerConfigsCacheFactory.create();

  private rawConfigs: t.MCPServers = {};

  public async getServerConfig(
    serverName: string,
    userId?: string,
  ): Promise<t.ParsedServerConfig | undefined> {
    const sharedAppServer = await this.sharedAppServers.get(serverName);
    if (sharedAppServer) return sharedAppServer;

    if (userId) {
      //we require user id to also access sharedServers to ensure that getServerConfig(serverName, undefined) returns only app level configs.
      const sharedUserServer = await this.sharedUserServers.get(serverName);
      if (sharedUserServer) return sharedUserServer;

      const privateUserServer = await this.privateServersCache.get(userId, serverName);
      if (privateUserServer) return privateUserServer;
    }

    /** Fallback to raw config if server hasn't been initialized yet */
    const rawConfig = this.rawConfigs[serverName];
    if (rawConfig) return rawConfig as t.ParsedServerConfig;

    return undefined;
  }

  public async getAllServerConfigs(userId?: string): Promise<Record<string, t.ParsedServerConfig>> {
    const privateConfigs = userId ? await this.privateServersCache.getAll(userId) : {};
    const registryConfigs = {
      ...(await this.sharedAppServers.getAll()),
      ...(await this.sharedUserServers.getAll()),
      ...privateConfigs,
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
    await this.privateServersCache.resetAll();
  }

  public async removeServer(serverName: string, userId?: string): Promise<void> {
    const appServer = await this.sharedAppServers.get(serverName);
    if (appServer) {
      await this.sharedAppServers.remove(serverName);
      return;
    }

    const userServer = await this.sharedUserServers.get(serverName);
    if (userServer) {
      await this.sharedUserServers.remove(serverName);
      return;
    }

    if (userId) {
      const privateServer = await this.privateServersCache.get(userId, serverName);
      if (privateServer) {
        await this.privateServersCache.remove(userId, serverName);
        return;
      }
    } else {
      const affectedUsers = await this.privateServersCache.findUsersWithServer(serverName);
      if (affectedUsers.length > 0) {
        await this.privateServersCache.removeServerConfigIfCacheExists(affectedUsers, serverName);
        return;
      }
    }

    throw new Error(`Server ${serverName} not found`);
  }
}

export const mcpServersRegistry = new MCPServersRegistry();
