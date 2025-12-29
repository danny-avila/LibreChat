import { logger } from '@librechat/data-schemas';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { MCPConnection } from './connection';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';
import type * as t from './types';

/**
 * Manages MCP connections with lazy loading and reconnection.
 * Maintains a pool of connections and handles connection lifecycle management.
 * Queries server configurations dynamically from the MCPServersRegistry (single source of truth).
 *
 * Scope-aware: Each repository is tied to a specific owner scope:
 * - ownerId = undefined → manages app-level servers only
 * - ownerId = userId → manages user-level and private servers for that user
 */
export class ConnectionsRepository {
  protected connections: Map<string, MCPConnection> = new Map();
  protected oauthOpts: t.OAuthConnectionOptions | undefined;
  private readonly ownerId: string | undefined;

  constructor(ownerId?: string, oauthOpts?: t.OAuthConnectionOptions) {
    this.ownerId = ownerId;
    this.oauthOpts = oauthOpts;
  }

  /** Checks whether this repository can connect to a specific server */
  async has(serverName: string): Promise<boolean> {
    const config = await MCPServersRegistry.getInstance().getServerConfig(serverName, this.ownerId);
    const canConnect = !!config && this.isAllowedToConnectToServer(config);
    if (!canConnect) {
      //if connection is no longer possible we attempt to disconnect any leftover connections
      await this.disconnect(serverName);
    }
    return canConnect;
  }

  /** Gets or creates a connection for the specified server with lazy loading */
  async get(serverName: string): Promise<MCPConnection | null> {
    const serverConfig = await MCPServersRegistry.getInstance().getServerConfig(
      serverName,
      this.ownerId,
    );

    const existingConnection = this.connections.get(serverName);
    if (!serverConfig || !this.isAllowedToConnectToServer(serverConfig)) {
      if (existingConnection) {
        await existingConnection.disconnect();
      }
      return null;
    }
    if (existingConnection) {
      // Check if config was cached/updated since connection was created
      if (serverConfig.updatedAt && existingConnection.isStale(serverConfig.updatedAt)) {
        logger.info(
          `${this.prefix(serverName)} Existing connection for ${serverName} is outdated. Recreating a new connection.`,
          {
            connectionCreated: new Date(existingConnection.createdAt).toISOString(),
            configCachedAt: new Date(serverConfig.updatedAt).toISOString(),
          },
        );

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
    return new Map((connections as [string, MCPConnection][]).filter((v) => !!v[1]));
  }

  /** Returns all currently loaded connections without creating new ones */
  async getLoaded(): Promise<Map<string, MCPConnection>> {
    return this.getMany(Array.from(this.connections.keys()));
  }

  /** Gets or creates connections for all configured servers in this repository's scope */
  async getAll(): Promise<Map<string, MCPConnection>> {
    //TODO in the future we should use a scoped config getter (APPLevel, UserLevel, Private)
    //for now the absent config will not throw error
    const allConfigs = await MCPServersRegistry.getInstance().getAllServerConfigs(this.ownerId);
    return this.getMany(Object.keys(allConfigs));
  }

  /** Disconnects and removes a specific server connection from the pool */
  async disconnect(serverName: string): Promise<void> {
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

  // Returns formatted log prefix for server messages
  protected prefix(serverName: string): string {
    return `[MCP][${serverName}]`;
  }

  private isAllowedToConnectToServer(config: t.ParsedServerConfig) {
    //the repository is not allowed to be connected in case the Connection repository is shared (ownerId is undefined/null) and the server requires Auth or startup false.
    if (this.ownerId === undefined && (config.startup === false || config.requiresOAuth)) {
      return false;
    }
    return true;
  }
}
