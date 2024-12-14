import { MCPConnection } from './connection';
import type { Logger } from 'winston';
import type * as t from './types/mcp';

export class MCPManager {
  private static instance: MCPManager | null = null;
  private connections: Map<string, MCPConnection> = new Map();
  private logger: Logger;

  private static getDefaultLogger(): Logger {
    return {
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
    } as Logger;
  }

  private constructor(logger?: Logger) {
    this.logger = logger || MCPManager.getDefaultLogger();
  }

  public static getInstance(): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager();
    }
    return MCPManager.instance;
  }

  public async initializeMCP(mcpServers: t.MCPServers): Promise<void> {
    this.logger.info('Initializing MCP servers...');

    try {
      for (const [serverName, config] of Object.entries(mcpServers)) {
        this.logger.info(`Initializing ${serverName} server...`);
        const connection = await this.initializeServer(serverName, config);

        // Test the connection
        try {
          // const resources = await connection.fetchResources();
          const serverCapabilities = connection.client.getServerCapabilities();
          this.logger.info(`Available capabilities for ${serverName}:`, serverCapabilities);
          if (serverCapabilities?.tools) {
            connection.client.listTools().then((tools) => {
              this.logger.info(`Available tools for ${serverName}:`, tools);
            });
          }
        } catch (error) {
          this.logger.error(`Error fetching capabilities for ${serverName}:`, error);
        }
      }
    } catch (error) {
      this.logger.error('Failed to initialize MCP servers:', error);
    }
  }

  public async initializeServer(serverName: string, options: t.MCPOptions): Promise<MCPConnection> {
    // Clean up existing connection if any
    await this.disconnectServer(serverName);

    const connection = new MCPConnection(options);

    // Set up event forwarding
    connection.on('connectionChange', (state) => {
      this.logger.info(`MCP connection state changed for ${serverName} to: ${state}`);
    });

    connection.on('error', (error) => {
      this.logger.error(`MCP error for ${serverName}:`, error);
    });

    try {
      await connection.connectClient();
      this.connections.set(serverName, connection);
      return connection;
    } catch (error) {
      this.logger.error(`Failed to initialize ${serverName}:`, error);
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
