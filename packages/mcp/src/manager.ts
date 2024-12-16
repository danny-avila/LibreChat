import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { JsonSchemaType } from 'librechat-data-provider';
import type { Logger } from 'winston';
import type * as t from './types/mcp';
import { formatToolContent } from './parsers';
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
    this.logger.info('[MCP] Initializing servers');

    try {
      const initPromises = Object.entries(mcpServers).map(([serverName, config]) =>
        this.initializeServer(serverName, config)
          .then(async (connection) => {
            try {
              const serverCapabilities = connection.client.getServerCapabilities();
              this.logger.info(
                `[MCP][${serverName}] Capabilities: ${JSON.stringify(serverCapabilities)}`,
              );
              if (serverCapabilities?.tools) {
                const tools = await connection.client.listTools();
                this.logger.info(`[MCP][${serverName}] Available tools: ${JSON.stringify(tools)}`);
              }
            } catch (error) {
              this.logger.error(`[MCP][${serverName}] Error fetching capabilities: ${error}`);
            }
          })
          .catch((error) => {
            this.logger.error(`[MCP][${serverName}] Initialization failed: ${error}`);
          }),
      );
      await Promise.all(initPromises);
    } catch (error) {
      this.logger.error(`[MCP] Server initialization failed: ${error}`);
      throw error;
    }
  }

  public async initializeServer(serverName: string, options: t.MCPOptions): Promise<MCPConnection> {
    // Clean up existing connection if any
    await this.disconnectServer(serverName);

    const connection = new MCPConnection(serverName, options, this.logger);

    // Set up event forwarding
    connection.on('connectionChange', (state) => {
      this.logger.info(`[MCP][${serverName}] Connection state: ${state}`);
    });

    connection.on('error', (error) => {
      this.logger.error(`[MCP][${serverName}] Error: ${error}`);
    });

    try {
      await connection.connectClient();
      this.connections.set(serverName, connection);
      return connection;
    } catch (error) {
      this.logger.error(`[MCP][${serverName}] Initialization failed: ${error}`);
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
        this.logger.warn(`[MCP][${serverName}] Not connected, skipping tool fetch`);
      }
    }
  }

  public async loadManifestTools(manifestTools: t.LCToolManifest): Promise<void> {
    for (const [serverName, connection] of this.connections.entries()) {
      try {
        if (connection.isConnected() !== true) {
          this.logger.warn(`Connection ${serverName} is not connected. Skipping tool fetch.`);
          continue;
        }

        const tools = await connection.fetchTools();
        for (const tool of tools) {
          const pluginKey = `${tool.name}${CONSTANTS.mcp_delimiter}${serverName}`;
          manifestTools.push({
            name: tool.name,
            pluginKey,
            description: tool.description ?? '',
            icon: connection.iconPath,
          });
        }
      } catch (error) {
        this.logger.error(`[MCP][${serverName}] Error fetching tools: ${error}`);
      }
    }
  }

  async callTool(
    serverName: string,
    toolName: string,
    provider: t.Provider,
    toolArguments?: Record<string, unknown>,
  ): Promise<t.FormattedToolResponse> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(
        `No connection found for server: ${serverName}. Please make sure to use MCP servers available under 'Connected MCP Servers'.`,
      );
    }
    const result = await connection.client.request(
      {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: toolArguments,
        },
      },
      CallToolResultSchema,
    );
    return formatToolContent(result, provider);
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
