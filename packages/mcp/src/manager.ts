import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { JsonSchemaType } from 'librechat-data-provider';
import type { Logger } from 'winston';
import type * as t from './types/mcp';
import { MCPConnection } from './connection';
import { CONSTANTS } from './enum';

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

  public static getInstance(logger?: Logger): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager(logger);
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

    const connection = new MCPConnection(options, this.logger);

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

  public async mapAvailableTools(availableTools: t.LCAvailableTools): Promise<void> {
    for (const [serverName, connection] of this.connections.entries()) {
      try {
        if (connection.isConnected() !== true) {
          this.logger.warn(`Connection ${serverName} is not connected. Skipping tool fetch.`);
          continue;
        }

        const tools = await connection.fetchTools();
        for (const tool of tools) {
          const name = `${tool.name}${CONSTANTS.mcp_delimiter}${serverName}`;
          availableTools[name] = {
            type: 'function',
            ['function']: {
              name,
              description: tool.description,
              parameters: tool.inputSchema as JsonSchemaType,
            },
          };
        }
      } catch (error) {
        this.logger.error(`Error fetching tools for ${serverName}:`, error);
      }
    }
  }

  async callTool(
    serverName: string,
    toolName: string,
    toolArguments?: Record<string, unknown>,
  ): Promise<t.MCPToolCallResponse> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(
        `No connection found for server: ${serverName}. Please make sure to use MCP servers available under 'Connected MCP Servers'.`,
      );
    }
    return await connection.client.request(
      {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: toolArguments,
        },
      },
      CallToolResultSchema,
    );
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
