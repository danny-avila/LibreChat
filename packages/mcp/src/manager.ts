import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { JsonSchemaType, MCPOptions } from 'librechat-data-provider';
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

  public async initializeMCP(
    mcpServers: t.MCPServers,
    processMCPEnv: (obj: MCPOptions) => MCPOptions,
  ): Promise<void> {
    this.logger.info('[MCP] Initializing servers');

    const entries = Object.entries(mcpServers);
    const initializedServers = new Set();
    const connectionResults = await Promise.allSettled(
      entries.map(async ([serverName, _config], i) => {
        const config = processMCPEnv(_config);
        const connection = new MCPConnection(serverName, config, this.logger);

        connection.on('connectionChange', (state) => {
          this.logger.info(`[MCP][${serverName}] Connection state: ${state}`);
        });

        try {
          const connectionTimeout = new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), 30000),
          );

          const connectionAttempt = this.initializeServer(connection, serverName);
          await Promise.race([connectionAttempt, connectionTimeout]);

          if (connection.isConnected()) {
            initializedServers.add(i);
            this.connections.set(serverName, connection);

            const serverCapabilities = connection.client.getServerCapabilities();
            this.logger.info(
              `[MCP][${serverName}] Capabilities: ${JSON.stringify(serverCapabilities)}`,
            );

            if (serverCapabilities?.tools) {
              const tools = await connection.client.listTools();
              if (tools.tools.length) {
                this.logger.info(
                  `[MCP][${serverName}] Available tools: ${tools.tools
                    .map((tool) => tool.name)
                    .join(', ')}`,
                );
              }
            }
          }
        } catch (error) {
          this.logger.error(`[MCP][${serverName}] Initialization failed`, error);
          throw error;
        }
      }),
    );

    const failedConnections = connectionResults.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    this.logger.info(`[MCP] Initialized ${initializedServers.size}/${entries.length} server(s)`);

    if (failedConnections.length > 0) {
      this.logger.warn(
        `[MCP] ${failedConnections.length}/${entries.length} server(s) failed to initialize`,
      );
    }

    entries.forEach(([serverName], index) => {
      if (initializedServers.has(index)) {
        this.logger.info(`[MCP][${serverName}] ✓ Initialized`);
      } else {
        this.logger.info(`[MCP][${serverName}] ✗ Failed`);
      }
    });

    if (initializedServers.size === entries.length) {
      this.logger.info('[MCP] All servers initialized successfully');
    } else if (initializedServers.size === 0) {
      this.logger.error('[MCP] No servers initialized');
    }
  }

  private async initializeServer(connection: MCPConnection, serverName: string): Promise<void> {
    const maxAttempts = 3;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        await connection.connect();

        if (connection.isConnected()) {
          return;
        }
      } catch (error) {
        attempts++;

        if (attempts === maxAttempts) {
          this.logger.error(`[MCP][${serverName}] Failed after ${maxAttempts} attempts`);
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
      }
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
        this.logger.warn(`[MCP][${serverName}] Error fetching tools:`, error);
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
        this.logger.error(`[MCP][${serverName}] Error fetching tools:`, error);
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
      { timeout: connection.timeout },
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
