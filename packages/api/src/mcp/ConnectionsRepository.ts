import { logger } from '@librechat/data-schemas';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { MCPConnection } from './connection';
import type { ServerConfigsCache } from '~/mcp/registry/cache/ServerConfigsCacheFactory';
import type * as t from './types';

/**
 * Manages MCP connections with lazy loading and reconnection.
 * Maintains a pool of connections and handles connection lifecycle management.
 * Pulls server configurations dynamically from the provided cache.
 */
export class ConnectionsRepository {
  protected connections: Map<string, MCPConnection> = new Map();
  protected oauthOpts: t.OAuthConnectionOptions | undefined;

  constructor(
    private readonly serverConfigs: ServerConfigsCache,
    oauthOpts?: t.OAuthConnectionOptions,
  ) {
    this.oauthOpts = oauthOpts;
  }

  /** Checks whether this repository can connect to a specific server */
  async has(serverName: string): Promise<boolean> {
    const config = await this.serverConfigs.get(serverName);
    if (!config) {
      //if the config does not exist, clean up any potential orphaned connections (caused by server tier migration)
      await this.disconnect(serverName);
    }
    return !!config;
  }

  /** Gets or creates a connection for the specified server with lazy loading */
  async get(serverName: string): Promise<MCPConnection> {
    const serverConfig = await this.getServerConfig(serverName);
    const existingConnection = this.connections.get(serverName);

    if (existingConnection) {
      // Check if config was cached/updated since connection was created
      if (serverConfig.cachedAt && existingConnection.isStale(serverConfig.cachedAt)) {
        logger.info(`${this.prefix(serverName)} Config updated, reconnecting`, {
          connectionCreated: new Date(existingConnection.createdAt).toISOString(),
          configCachedAt: new Date(serverConfig.cachedAt).toISOString(),
        });

        // Disconnect stale connection
        await existingConnection.disconnect();
        this.connections.delete(serverName);
        // Fall through to create new connection
      } else if (await existingConnection.isConnected()) {
        return existingConnection;
      } else {
        await this.disconnect(serverName);
      }
    }

    const connection = await MCPConnectionFactory.create(
      {
        serverName,
        serverConfig,
      },
      this.oauthOpts,
    );

    this.connections.set(serverName, connection);
    return connection;
  }

  /** Gets or creates connections for multiple servers concurrently */
  async getMany(serverNames: string[]): Promise<Map<string, MCPConnection>> {
    const connectionPromises = serverNames.map(async (name) => [name, await this.get(name)]);
    const connections = await Promise.all(connectionPromises);
    return new Map(connections as [string, MCPConnection][]);
  }

  /** Returns all currently loaded connections without creating new ones */
  async getLoaded(): Promise<Map<string, MCPConnection>> {
    return this.getMany(Array.from(this.connections.keys()));
  }

  /** Gets or creates connections for all configured servers */
  async getAll(): Promise<Map<string, MCPConnection>> {
    const allConfigs = await this.serverConfigs.getAll();
    return this.getMany(Object.keys(allConfigs));
  }

  /** Disconnects and removes a specific server connection from the pool */
  disconnect(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (!connection) return Promise.resolve();
    this.connections.delete(serverName);
    return connection.disconnect().catch((err) => {
      logger.error(`${this.prefix(serverName)} Error disconnecting`, err);
    });
  }

  /** Disconnects all active connections and returns array of disconnect promises */
  disconnectAll(): Promise<void>[] {
    const serverNames = Array.from(this.connections.keys());
    return serverNames.map((serverName) => this.disconnect(serverName));
  }

  // Retrieves server configuration by name or throws if not found
  protected async getServerConfig(serverName: string): Promise<t.ParsedServerConfig> {
    const serverConfig = await this.serverConfigs.get(serverName);
    if (serverConfig) return serverConfig;
    throw new Error(`${this.prefix(serverName)} Server not found in configuration`);
  }

  // Returns formatted log prefix for server messages
  protected prefix(serverName: string): string {
    return `[MCP][${serverName}]`;
  }
}
