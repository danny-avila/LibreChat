import { logger } from '@librechat/data-schemas';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { MCPConnection } from './connection';
import type * as t from './types';

/**
 * Manages MCP connections with lazy loading and reconnection.
 * Maintains a pool of connections and handles connection lifecycle management.
 */
export class ConnectionsRepository {
  protected readonly serverConfigs: Record<string, t.MCPOptions>;
  protected connections: Map<string, MCPConnection> = new Map();
  protected oauthOpts: t.OAuthConnectionOptions | undefined;

  constructor(serverConfigs: t.MCPServers, oauthOpts?: t.OAuthConnectionOptions) {
    this.serverConfigs = serverConfigs;
    this.oauthOpts = oauthOpts;
  }

  /** Checks whether this repository can connect to a specific server */
  has(serverName: string): boolean {
    return !!this.serverConfigs[serverName];
  }

  /** Gets or creates a connection for the specified server with lazy loading */
  async get(serverName: string): Promise<MCPConnection> {
    const existingConnection = this.connections.get(serverName);
    if (existingConnection && (await existingConnection.isConnected())) return existingConnection;
    else await this.disconnect(serverName);

    const connection = await MCPConnectionFactory.create(
      {
        serverName,
        serverConfig: this.getServerConfig(serverName),
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
    return this.getMany(Object.keys(this.serverConfigs));
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
  protected getServerConfig(serverName: string): t.MCPOptions {
    const serverConfig = this.serverConfigs[serverName];
    if (serverConfig) return serverConfig;
    throw new Error(`${this.prefix(serverName)} Server not found in configuration`);
  }

  // Returns formatted log prefix for server messages
  protected prefix(serverName: string): string {
    return `[MCP][${serverName}]`;
  }
}
