import { CallToolResultSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { JsonSchemaType, MCPOptions } from 'librechat-data-provider';
import type { Logger } from 'winston';
import type * as t from './types/mcp';
import { formatToolContent } from './parsers';
import { MCPConnection } from './connection';
import { CONSTANTS } from './enum';

export interface CallToolOptions extends RequestOptions {
  userId?: string;
}

export class MCPManager {
  private static instance: MCPManager | null = null;
  /** App-level connections initialized at startup */
  private connections: Map<string, MCPConnection> = new Map();
  /** User-specific connections initialized on demand */
  private userConnections: Map<string, Map<string, MCPConnection>> = new Map();
  /** Last activity timestamp for users (not per server) */
  private userLastActivity: Map<string, number> = new Map();
  private readonly USER_CONNECTION_IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes (TODO: make configurable)
  private mcpConfigs: t.MCPServers = {};
  private processMCPEnv?: (obj: MCPOptions, userId?: string) => MCPOptions; // Store the processing function
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
    // Check for idle connections when getInstance is called
    MCPManager.instance.checkIdleConnections();
    return MCPManager.instance;
  }

  /** Stores configs and initializes app-level connections */
  public async initializeMCP(
    mcpServers: t.MCPServers,
    processMCPEnv?: (obj: MCPOptions) => MCPOptions,
  ): Promise<void> {
    this.logger.info('[MCP] Initializing app-level servers');
    this.processMCPEnv = processMCPEnv; // Store the function
    this.mcpConfigs = mcpServers;

    const entries = Object.entries(mcpServers);
    const initializedServers = new Set();
    const connectionResults = await Promise.allSettled(
      entries.map(async ([serverName, _config], i) => {
        /** Process env for app-level connections */
        const config = this.processMCPEnv ? this.processMCPEnv(_config) : _config;
        const connection = new MCPConnection(serverName, config, this.logger);

        try {
          const connectionTimeout = new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), 30000),
          );

          const connectionAttempt = this.initializeServer(connection, `[MCP][${serverName}]`);
          await Promise.race([connectionAttempt, connectionTimeout]);

          if (connection.isConnected()) {
            initializedServers.add(i);
            this.connections.set(serverName, connection); // Store in app-level map

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

    this.logger.info(
      `[MCP] Initialized ${initializedServers.size}/${entries.length} app-level server(s)`,
    );

    if (failedConnections.length > 0) {
      this.logger.warn(
        `[MCP] ${failedConnections.length}/${entries.length} app-level server(s) failed to initialize`,
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
      this.logger.info('[MCP] All app-level servers initialized successfully');
    } else if (initializedServers.size === 0) {
      this.logger.warn('[MCP] No app-level servers initialized');
    }
  }

  /** Generic server initialization logic */
  private async initializeServer(connection: MCPConnection, logPrefix: string): Promise<void> {
    const maxAttempts = 3;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        await connection.connect();
        if (connection.isConnected()) {
          return;
        }
        throw new Error('Connection attempt succeeded but status is not connected');
      } catch (error) {
        attempts++;
        if (attempts === maxAttempts) {
          this.logger.error(`${logPrefix} Failed to connect after ${maxAttempts} attempts`, error);
          throw error; // Re-throw the last error
        }
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
      }
    }
  }

  /** Check for and disconnect idle connections */
  private checkIdleConnections(currentUserId?: string): void {
    const now = Date.now();

    // Iterate through all users to check for idle ones
    for (const [userId, lastActivity] of this.userLastActivity.entries()) {
      if (currentUserId && currentUserId === userId) {
        continue;
      }
      if (now - lastActivity > this.USER_CONNECTION_IDLE_TIMEOUT) {
        this.logger.info(
          `[MCP][User: ${userId}] User idle for too long. Disconnecting all connections...`,
        );
        // Disconnect all user connections asynchronously (fire and forget)
        this.disconnectUserConnections(userId).catch((err) =>
          this.logger.error(`[MCP][User: ${userId}] Error disconnecting idle connections:`, err),
        );
      }
    }
  }

  /** Updates the last activity timestamp for a user */
  private updateUserLastActivity(userId: string): void {
    const now = Date.now();
    this.userLastActivity.set(userId, now);
    this.logger.debug(
      `[MCP][User: ${userId}] Updated last activity timestamp: ${new Date(now).toISOString()}`,
    );
  }

  /** Gets or creates a connection for a specific user */
  public async getUserConnection(userId: string, serverName: string): Promise<MCPConnection> {
    const userServerMap = this.userConnections.get(userId);
    let connection = userServerMap?.get(serverName);
    const now = Date.now();

    // Check if user is idle
    const lastActivity = this.userLastActivity.get(userId);
    if (lastActivity && now - lastActivity > this.USER_CONNECTION_IDLE_TIMEOUT) {
      this.logger.info(
        `[MCP][User: ${userId}] User idle for too long. Disconnecting all connections.`,
      );
      // Disconnect all user connections
      try {
        await this.disconnectUserConnections(userId);
      } catch (err) {
        this.logger.error(`[MCP][User: ${userId}] Error disconnecting idle connections:`, err);
      }
      connection = undefined; // Force creation of a new connection
    } else if (connection) {
      if (connection.isConnected()) {
        this.logger.debug(`[MCP][User: ${userId}][${serverName}] Reusing active connection`);
        // Update timestamp on reuse
        this.updateUserLastActivity(userId);
        return connection;
      } else {
        // Connection exists but is not connected, attempt to remove potentially stale entry
        this.logger.warn(
          `[MCP][User: ${userId}][${serverName}] Found existing but disconnected connection object. Cleaning up.`,
        );
        this.removeUserConnection(userId, serverName); // Clean up maps
        connection = undefined;
      }
    }

    // If no valid connection exists, create a new one
    if (!connection) {
      this.logger.info(`[MCP][User: ${userId}][${serverName}] Establishing new connection`);
    }

    let config = this.mcpConfigs[serverName];
    if (!config) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `[MCP][User: ${userId}] Configuration for server "${serverName}" not found.`,
      );
    }

    if (this.processMCPEnv) {
      config = { ...(this.processMCPEnv(config, userId) ?? {}) };
    }

    connection = new MCPConnection(serverName, config, this.logger, userId);

    try {
      const connectionTimeout = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), 30000),
      );
      const connectionAttempt = this.initializeServer(
        connection,
        `[MCP][User: ${userId}][${serverName}]`,
      );
      await Promise.race([connectionAttempt, connectionTimeout]);

      if (!connection.isConnected()) {
        throw new Error('Failed to establish connection after initialization attempt.');
      }

      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Map());
      }
      this.userConnections.get(userId)?.set(serverName, connection);
      this.logger.info(`[MCP][User: ${userId}][${serverName}] Connection successfully established`);
      // Update timestamp on creation
      this.updateUserLastActivity(userId);
      return connection;
    } catch (error) {
      this.logger.error(
        `[MCP][User: ${userId}][${serverName}] Failed to establish connection`,
        error,
      );
      // Ensure partial connection state is cleaned up if initialization fails
      await connection.disconnect().catch((disconnectError) => {
        this.logger.error(
          `[MCP][User: ${userId}][${serverName}] Error during cleanup after failed connection`,
          disconnectError,
        );
      });
      // Ensure cleanup even if connection attempt fails
      this.removeUserConnection(userId, serverName);
      throw error; // Re-throw the error to the caller
    }
  }

  /** Removes a specific user connection entry */
  private removeUserConnection(userId: string, serverName: string): void {
    // Remove connection object
    const userMap = this.userConnections.get(userId);
    if (userMap) {
      userMap.delete(serverName);
      if (userMap.size === 0) {
        this.userConnections.delete(userId);
        // Only remove user activity timestamp if all connections are gone
        this.userLastActivity.delete(userId);
      }
    }

    this.logger.debug(`[MCP][User: ${userId}][${serverName}] Removed connection entry.`);
  }

  /** Disconnects and removes a specific user connection */
  public async disconnectUserConnection(userId: string, serverName: string): Promise<void> {
    const userMap = this.userConnections.get(userId);
    const connection = userMap?.get(serverName);
    if (connection) {
      this.logger.info(`[MCP][User: ${userId}][${serverName}] Disconnecting...`);
      await connection.disconnect();
      this.removeUserConnection(userId, serverName);
    }
  }

  /** Disconnects and removes all connections for a specific user */
  public async disconnectUserConnections(userId: string): Promise<void> {
    const userMap = this.userConnections.get(userId);
    const disconnectPromises: Promise<void>[] = [];
    if (userMap) {
      this.logger.info(`[MCP][User: ${userId}] Disconnecting all servers...`);
      const userServers = Array.from(userMap.keys());
      for (const serverName of userServers) {
        disconnectPromises.push(
          this.disconnectUserConnection(userId, serverName).catch((error) => {
            this.logger.error(
              `[MCP][User: ${userId}][${serverName}] Error during disconnection:`,
              error,
            );
          }),
        );
      }
      await Promise.allSettled(disconnectPromises);
      // Ensure user activity timestamp is removed
      this.userLastActivity.delete(userId);
      this.logger.info(`[MCP][User: ${userId}] All connections processed for disconnection.`);
    }
  }

  /** Returns the app-level connection (used for mapping tools, etc.) */
  public getConnection(serverName: string): MCPConnection | undefined {
    return this.connections.get(serverName);
  }

  /** Returns all app-level connections */
  public getAllConnections(): Map<string, MCPConnection> {
    return this.connections;
  }

  /**
   * Maps available tools from all app-level connections into the provided object.
   * The object is modified in place.
   */
  public async mapAvailableTools(availableTools: t.LCAvailableTools): Promise<void> {
    for (const [serverName, connection] of this.connections.entries()) {
      try {
        if (connection.isConnected() !== true) {
          this.logger.warn(
            `[MCP][${serverName}] Connection not established. Skipping tool mapping.`,
          );
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
        this.logger.warn(`[MCP][${serverName}] Error fetching tools for mapping:`, error);
      }
    }
  }

  /**
   * Loads tools from all app-level connections into the manifest.
   */
  public async loadManifestTools(manifestTools: t.LCToolManifest): Promise<t.LCToolManifest> {
    const mcpTools: t.LCManifestTool[] = [];

    for (const [serverName, connection] of this.connections.entries()) {
      try {
        if (connection.isConnected() !== true) {
          this.logger.warn(
            `[MCP][${serverName}] Connection not established. Skipping manifest loading.`,
          );
          continue;
        }

        const tools = await connection.fetchTools();
        for (const tool of tools) {
          const pluginKey = `${tool.name}${CONSTANTS.mcp_delimiter}${serverName}`;
          const manifestTool: t.LCManifestTool = {
            name: tool.name,
            pluginKey,
            description: tool.description ?? '',
            icon: connection.iconPath,
          };
          const config = this.mcpConfigs[serverName];
          if (config?.chatMenu === false) {
            manifestTool.chatMenu = false;
          }
          mcpTools.push(manifestTool);
        }
      } catch (error) {
        this.logger.error(`[MCP][${serverName}] Error fetching tools for manifest:`, error);
      }
    }

    return [...mcpTools, ...manifestTools];
  }

  /**
   * Calls a tool on an MCP server, using either a user-specific connection
   * (if userId is provided) or an app-level connection. Updates the last activity timestamp
   * for user-specific connections upon successful call initiation.
   */
  async callTool({
    serverName,
    toolName,
    provider,
    toolArguments,
    options,
  }: {
    serverName: string;
    toolName: string;
    provider: t.Provider;
    toolArguments?: Record<string, unknown>;
    options?: CallToolOptions;
  }): Promise<t.FormattedToolResponse> {
    let connection: MCPConnection | undefined;
    const { userId, ...callOptions } = options ?? {};
    const logPrefix = userId ? `[MCP][User: ${userId}][${serverName}]` : `[MCP][${serverName}]`;

    try {
      if (userId) {
        this.updateUserLastActivity(userId);
        // Get or create user-specific connection
        connection = await this.getUserConnection(userId, serverName);
      } else {
        // Use app-level connection
        connection = this.connections.get(serverName);
        if (!connection) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `${logPrefix} No app-level connection found. Cannot execute tool ${toolName}.`,
          );
        }
      }

      if (!connection.isConnected()) {
        // This might happen if getUserConnection failed silently or app connection dropped
        throw new McpError(
          ErrorCode.InternalError, // Use InternalError for connection issues
          `${logPrefix} Connection is not active. Cannot execute tool ${toolName}.`,
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
        {
          timeout: connection.timeout,
          ...callOptions,
        },
      );
      if (userId) {
        this.updateUserLastActivity(userId);
      }
      this.checkIdleConnections();
      return formatToolContent(result, provider);
    } catch (error) {
      // Log with context and re-throw or handle as needed
      this.logger.error(`${logPrefix}[${toolName}] Tool call failed`, error);
      // Rethrowing allows the caller (createMCPTool) to handle the final user message
      throw error;
    }
  }

  /** Disconnects a specific app-level server */
  public async disconnectServer(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (connection) {
      this.logger.info(`[MCP][${serverName}] Disconnecting...`);
      await connection.disconnect();
      this.connections.delete(serverName);
    }
  }

  /** Disconnects all app-level and user-level connections */
  public async disconnectAll(): Promise<void> {
    this.logger.info('[MCP] Disconnecting all app-level and user-level connections...');

    const userDisconnectPromises = Array.from(this.userConnections.keys()).map((userId) =>
      this.disconnectUserConnections(userId),
    );
    await Promise.allSettled(userDisconnectPromises);
    this.userLastActivity.clear();

    // Disconnect all app-level connections
    const appDisconnectPromises = Array.from(this.connections.values()).map((connection) =>
      connection.disconnect().catch((error) => {
        this.logger.error(`[MCP][${connection.serverName}] Error during disconnectAll:`, error);
      }),
    );
    await Promise.allSettled(appDisconnectPromises);
    this.connections.clear();

    this.logger.info('[MCP] All connections processed for disconnection.');
  }

  /** Destroys the singleton instance and disconnects all connections */
  public static async destroyInstance(): Promise<void> {
    if (MCPManager.instance) {
      await MCPManager.instance.disconnectAll();
      MCPManager.instance = null;
      const logger = MCPManager.getDefaultLogger();
      logger.info('[MCP] Manager instance destroyed.');
    }
  }
}
