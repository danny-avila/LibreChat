import { MCPConnection } from './connection';
import type { MCPOptions } from './types/mcp';
export class MCPManager {
  private static instance: MCPManager | null = null;
  private connections: Map<string, MCPConnection> = new Map();

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  public static getInstance(): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager();
    }
    return MCPManager.instance;
  }

  public async initializeServer(serverName: string, options: MCPOptions): Promise<MCPConnection> {
    // Clean up existing connection if any
    await this.disconnectServer(serverName);

    const connection = new MCPConnection(options);

    // Set up event forwarding
    connection.on('connectionChange', (state) => {
      console.log(`MCP connection state changed for ${serverName} to: ${state}`);
    });

    connection.on('error', (error) => {
      console.error(`MCP error for ${serverName}:`, error);
    });

    try {
      await connection.connectClient();
      this.connections.set(serverName, connection);
      return connection;
    } catch (error) {
      console.error(`Failed to initialize ${serverName}:`, error);
      throw error;
    }
  }

  public getConnection(serverName: string): MCPConnection | undefined {
    return this.connections.get(serverName);
  }

  public getAllConnections(): Map<string, MCPConnection> {
    return this.connections;
  }

  public async disconnectServer(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (connection) {
      await connection.disconnect();
      this.connections.delete(serverName);
    }
  }

  public async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.values()).map((connection) =>
      connection.disconnect(),
    );
    await Promise.all(disconnectPromises);
    this.connections.clear();
  }

  public static async destroyInstance(): Promise<void> {
    if (MCPManager.instance) {
      await MCPManager.instance.disconnectAll();
      MCPManager.instance = null;
    }
  }
}
