import { logger } from '@librechat/data-schemas';
import { CallToolResultSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { JsonSchemaType, MCPOptions, TUser } from 'librechat-data-provider';
import type { TokenMethods } from '@librechat/data-schemas';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens } from './oauth/types';
import type * as t from './types';
import { MCPTokenStorage } from './oauth/tokenStorage';
import { MCPOAuthHandler } from './oauth/handler';
import { formatToolContent } from './parsers';
import { MCPConnection } from './connection';
import { CONSTANTS } from './enum';

// System user ID for app-level OAuth tokens (all zeros ObjectId)
const SYSTEM_USER_ID = '000000000000000000000000';

export interface CallToolOptions extends RequestOptions {
  user?: TUser;
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
  private processMCPEnv?: (obj: MCPOptions, user?: TUser) => MCPOptions; // Store the processing function
  /** Store MCP server instructions */
  private serverInstructions: Map<string, string> = new Map();

  public static getInstance(): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager();
    }
    // Check for idle connections when getInstance is called
    MCPManager.instance.checkIdleConnections();
    return MCPManager.instance;
  }

  /** Stores configs and initializes app-level connections */
  public async initializeMCP(
    mcpServers: t.MCPServers,
    processMCPEnv?: (obj: MCPOptions) => MCPOptions,
    flowManager?: FlowStateManager<MCPOAuthTokens>,
    tokenMethods?: TokenMethods,
  ): Promise<void> {
    this.processMCPEnv = processMCPEnv; // Store the function
    this.mcpConfigs = mcpServers;

    if (!flowManager) {
      logger.info('[MCP] No flow manager provided, OAuth will not be available');
    }

    if (!tokenMethods) {
      logger.info('[MCP] No token methods provided, token persistence will not be available');
    }

    const entries = Object.entries(mcpServers);
    const initializedServers = new Set();
    const connectionResults = await Promise.allSettled(
      entries.map(async ([serverName, _config], i) => {
        /** Process env for app-level connections */
        const config = this.processMCPEnv ? this.processMCPEnv(_config) : _config;

        /** Existing tokens for system-level connections */
        let tokens: MCPOAuthTokens | null = null;
        if (tokenMethods?.findToken) {
          try {
            tokens = await MCPTokenStorage.getTokens({
              userId: SYSTEM_USER_ID,
              serverName,
              findToken: tokenMethods.findToken,
            });
          } catch {
            logger.debug(`[MCP][${serverName}] No existing tokens found`);
          }
        }

        if (tokens) {
          logger.info(`[MCP][${serverName}] Loaded existing OAuth tokens`);
        }

        const connection = new MCPConnection(serverName, config, undefined, tokens);

        /** Listen for OAuth requirements */
        logger.info(`[MCP][${serverName}] Setting up OAuth event listener`);
        connection.on('oauthRequired', async (data) => {
          logger.debug(`[MCP][${serverName}] oauthRequired event received`);
          const tokens = await this.handleOAuthRequired({
            ...data,
            flowManager,
          });

          if (tokens && tokenMethods?.createToken) {
            try {
              connection.setOAuthTokens(tokens);
              await MCPTokenStorage.storeTokens({
                userId: SYSTEM_USER_ID,
                serverName,
                tokens,
                createToken: tokenMethods.createToken,
              });
              logger.info(`[MCP][${serverName}] OAuth tokens saved to storage`);
            } catch (error) {
              logger.error(`[MCP][${serverName}] Failed to save OAuth tokens to storage`, error);
            }
          }

          connection.emit('oauthHandled');
        });

        try {
          const connectTimeout = config.initTimeout ?? 30000;
          const connectionTimeout = new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Connection timeout after ${connectTimeout}ms`)),
              connectTimeout,
            ),
          );

          const connectionAttempt = this.initializeServer(
            connection,
            `[MCP][${serverName}]`,
            false,
            flowManager,
          );
          await Promise.race([connectionAttempt, connectionTimeout]);

          if (await connection.isConnected()) {
            initializedServers.add(i);
            this.connections.set(serverName, connection);

            /** Unified `serverInstructions` configuration */
            const configInstructions = config.serverInstructions;

            if (configInstructions !== undefined) {
              if (typeof configInstructions === 'string') {
                this.serverInstructions.set(serverName, configInstructions);
                logger.info(
                  `[MCP][${serverName}] Custom instructions stored for context inclusion: ${configInstructions}`,
                );
              } else if (configInstructions === true) {
                /** Server-provided instructions */
                const serverInstructions = connection.client.getInstructions();

                if (serverInstructions) {
                  this.serverInstructions.set(serverName, serverInstructions);
                  logger.info(
                    `[MCP][${serverName}] Server instructions stored for context inclusion: ${serverInstructions}`,
                  );
                } else {
                  logger.info(
                    `[MCP][${serverName}] serverInstructions=true but no server instructions available`,
                  );
                }
              } else {
                logger.info(
                  `[MCP][${serverName}] Instructions explicitly disabled (serverInstructions=false)`,
                );
              }
            } else {
              logger.info(
                `[MCP][${serverName}] Instructions not included (serverInstructions not configured)`,
              );
            }

            const serverCapabilities = connection.client.getServerCapabilities();
            logger.info(`[MCP][${serverName}] Capabilities: ${JSON.stringify(serverCapabilities)}`);

            if (serverCapabilities?.tools) {
              const tools = await connection.client.listTools();
              if (tools.tools.length) {
                logger.info(
                  `[MCP][${serverName}] Available tools: ${tools.tools
                    .map((tool) => tool.name)
                    .join(', ')}`,
                );
              }
            }
          }
        } catch (error) {
          logger.error(`[MCP][${serverName}] Initialization failed`, error);
          throw error;
        }
      }),
    );

    const failedConnections = connectionResults.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    logger.info(
      `[MCP] Initialized ${initializedServers.size}/${entries.length} app-level server(s)`,
    );

    if (failedConnections.length > 0) {
      logger.warn(
        `[MCP] ${failedConnections.length}/${entries.length} app-level server(s) failed to initialize`,
      );
    }

    entries.forEach(([serverName], index) => {
      if (initializedServers.has(index)) {
        logger.info(`[MCP][${serverName}] ✓ Initialized`);
      } else {
        logger.info(`[MCP][${serverName}] ✗ Failed`);
      }
    });

    if (initializedServers.size === entries.length) {
      logger.info('[MCP] All app-level servers initialized successfully');
    } else if (initializedServers.size === 0) {
      logger.warn('[MCP] No app-level servers initialized');
    }
  }

  /** Generic server initialization logic */
  private async initializeServer(
    connection: MCPConnection,
    logPrefix: string,
    handleOAuth = true,
    flowManager?: FlowStateManager<MCPOAuthTokens>,
  ): Promise<void> {
    const maxAttempts = 3;
    let attempts = 0;
    /** Whether OAuth has been handled by the connection */
    let oauthHandled = false;

    while (attempts < maxAttempts) {
      try {
        await connection.connect();
        if (await connection.isConnected()) {
          return;
        }
        throw new Error('Connection attempt succeeded but status is not connected');
      } catch (error) {
        attempts++;

        if (this.isOAuthError(error)) {
          // Only handle OAuth if requested (not already handled by event listener)
          if (handleOAuth) {
            /** Check if OAuth was already handled by the connection */
            const errorWithFlag = error as (Error & { isOAuthError?: boolean }) | undefined;
            if (!oauthHandled && errorWithFlag?.isOAuthError) {
              oauthHandled = true;
              logger.info(`${logPrefix} Handling OAuth`);
              const serverUrl = connection.url;
              if (serverUrl) {
                await this.handleOAuthRequired({
                  serverName: connection.serverName,
                  serverUrl,
                  flowManager,
                });
              }
            } else {
              logger.info(`${logPrefix} OAuth already handled by connection`);
            }
          }
          // Don't retry on OAuth errors - just throw
          logger.info(`${logPrefix} OAuth required, stopping connection attempts`);
          throw error;
        }

        if (attempts === maxAttempts) {
          logger.error(`${logPrefix} Failed to connect after ${maxAttempts} attempts`, error);
          throw error; // Re-throw the last error
        }
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
      }
    }
  }

  private isOAuthError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    // Check for SSE error with 401 status
    if ('message' in error && typeof error.message === 'string') {
      return error.message.includes('401') || error.message.includes('Non-200 status code (401)');
    }

    // Check for error code
    if ('code' in error) {
      const code = (error as { code?: number }).code;
      return code === 401 || code === 403;
    }

    return false;
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
        logger.info(
          `[MCP][User: ${userId}] User idle for too long. Disconnecting all connections...`,
        );
        // Disconnect all user connections asynchronously (fire and forget)
        this.disconnectUserConnections(userId).catch((err) =>
          logger.error(`[MCP][User: ${userId}] Error disconnecting idle connections:`, err),
        );
      }
    }
  }

  /** Updates the last activity timestamp for a user */
  private updateUserLastActivity(userId: string): void {
    const now = Date.now();
    this.userLastActivity.set(userId, now);
    logger.debug(
      `[MCP][User: ${userId}] Updated last activity timestamp: ${new Date(now).toISOString()}`,
    );
  }

  /** Gets or creates a connection for a specific user */
  public async getUserConnection({
    user,
    serverName,
    flowManager,
    tokenMethods,
    oauthStart,
    oauthEnd,
  }: {
    user: TUser;
    serverName: string;
    flowManager?: FlowStateManager<MCPOAuthTokens>;
    tokenMethods?: TokenMethods;
    oauthStart?: (authURL: string) => void;
    oauthEnd?: () => void;
  }): Promise<MCPConnection> {
    const userId = user.id;
    if (!userId) {
      throw new McpError(ErrorCode.InvalidRequest, `[MCP] User object missing id property`);
    }

    const userServerMap = this.userConnections.get(userId);
    let connection = userServerMap?.get(serverName);
    const now = Date.now();

    // Check if user is idle
    const lastActivity = this.userLastActivity.get(userId);
    if (lastActivity && now - lastActivity > this.USER_CONNECTION_IDLE_TIMEOUT) {
      logger.info(`[MCP][User: ${userId}] User idle for too long. Disconnecting all connections.`);
      // Disconnect all user connections
      try {
        await this.disconnectUserConnections(userId);
      } catch (err) {
        logger.error(`[MCP][User: ${userId}] Error disconnecting idle connections:`, err);
      }
      connection = undefined; // Force creation of a new connection
    } else if (connection) {
      if (await connection.isConnected()) {
        logger.debug(`[MCP][User: ${userId}][${serverName}] Reusing active connection`);
        this.updateUserLastActivity(userId);
        return connection;
      } else {
        // Connection exists but is not connected, attempt to remove potentially stale entry
        logger.warn(
          `[MCP][User: ${userId}][${serverName}] Found existing but disconnected connection object. Cleaning up.`,
        );
        this.removeUserConnection(userId, serverName); // Clean up maps
        connection = undefined;
      }
    }

    // If no valid connection exists, create a new one
    if (!connection) {
      logger.info(`[MCP][User: ${userId}][${serverName}] Establishing new connection`);
    }

    let config = this.mcpConfigs[serverName];
    if (!config) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `[MCP][User: ${userId}] Configuration for server "${serverName}" not found.`,
      );
    }

    if (this.processMCPEnv) {
      config = { ...(this.processMCPEnv(config, user) ?? {}) };
    }

    /** If no in-memory tokens, tokens from persistent storage */
    let tokens: MCPOAuthTokens | null = null;
    if (tokenMethods?.findToken) {
      try {
        tokens = await MCPTokenStorage.getTokens({
          userId,
          serverName,
          findToken: tokenMethods.findToken,
        });
      } catch (error) {
        logger.error(
          `[MCP][User: ${userId}][${serverName}] Error loading OAuth tokens from storage`,
          error,
        );
      }
    }

    if (tokens) {
      logger.info(
        `[MCP][User: ${userId}][${serverName}] Loaded existing OAuth tokens from storage`,
      );
    }

    connection = new MCPConnection(serverName, config, userId, tokens);

    connection.on('oauthRequired', async (data) => {
      logger.info(`[MCP][User: ${userId}][${serverName}] oauthRequired event received`);
      const tokens = await this.handleOAuthRequired({
        ...data,
        flowManager,
        oauthStart,
        oauthEnd,
      });

      if (tokens && tokenMethods?.createToken) {
        try {
          connection?.setOAuthTokens(tokens);
          await MCPTokenStorage.storeTokens({
            userId,
            serverName,
            tokens,
            createToken: tokenMethods.createToken,
          });
          logger.info(`[MCP][User: ${userId}][${serverName}] OAuth tokens saved to storage`);
        } catch (error) {
          logger.error(
            `[MCP][User: ${userId}][${serverName}] Failed to save OAuth tokens to storage`,
            error,
          );
        }
      }

      // Emit oauthHandled to unblock the connection
      connection?.emit('oauthHandled');
    });

    try {
      const connectTimeout = config.initTimeout ?? 30000;
      const connectionTimeout = new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Connection timeout after ${connectTimeout}ms`)),
          connectTimeout,
        ),
      );
      const connectionAttempt = this.initializeServer(
        connection,
        `[MCP][User: ${userId}][${serverName}]`,
        true,
        flowManager,
      );
      await Promise.race([connectionAttempt, connectionTimeout]);

      if (!(await connection?.isConnected())) {
        throw new Error('Failed to establish connection after initialization attempt.');
      }

      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Map());
      }
      this.userConnections.get(userId)?.set(serverName, connection);

      logger.info(`[MCP][User: ${userId}][${serverName}] Connection successfully established`);
      // Update timestamp on creation
      this.updateUserLastActivity(userId);
      return connection;
    } catch (error) {
      logger.error(`[MCP][User: ${userId}][${serverName}] Failed to establish connection`, error);
      // Ensure partial connection state is cleaned up if initialization fails
      await connection?.disconnect().catch((disconnectError) => {
        logger.error(
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

    logger.debug(`[MCP][User: ${userId}][${serverName}] Removed connection entry.`);
  }

  /** Disconnects and removes a specific user connection */
  public async disconnectUserConnection(userId: string, serverName: string): Promise<void> {
    const userMap = this.userConnections.get(userId);
    const connection = userMap?.get(serverName);
    if (connection) {
      logger.info(`[MCP][User: ${userId}][${serverName}] Disconnecting...`);
      await connection.disconnect();
      this.removeUserConnection(userId, serverName);
    }
  }

  /** Disconnects and removes all connections for a specific user */
  public async disconnectUserConnections(userId: string): Promise<void> {
    const userMap = this.userConnections.get(userId);
    const disconnectPromises: Promise<void>[] = [];
    if (userMap) {
      logger.info(`[MCP][User: ${userId}] Disconnecting all servers...`);
      const userServers = Array.from(userMap.keys());
      for (const serverName of userServers) {
        disconnectPromises.push(
          this.disconnectUserConnection(userId, serverName).catch((error) => {
            logger.error(
              `[MCP][User: ${userId}][${serverName}] Error during disconnection:`,
              error,
            );
          }),
        );
      }
      await Promise.allSettled(disconnectPromises);
      // Ensure user activity timestamp is removed
      this.userLastActivity.delete(userId);
      logger.info(`[MCP][User: ${userId}] All connections processed for disconnection.`);
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

  /** Attempts to reconnect an app-level connection if it's disconnected */
  private async isConnectionActive(
    serverName: string,
    connection: MCPConnection,
  ): Promise<boolean> {
    if (await connection.isConnected()) {
      return true;
    }

    logger.info(
      `[MCP][${serverName}] App-level connection disconnected, attempting to reconnect...`,
    );

    try {
      const config = this.mcpConfigs[serverName];
      if (!config) {
        logger.error(`[MCP][${serverName}] Configuration not found for reconnection`);
        return false;
      }

      await this.initializeServer(connection, `[MCP][${serverName}]`);

      if (await connection.isConnected()) {
        logger.info(`[MCP][${serverName}] App-level connection successfully reconnected`);
        return true;
      } else {
        logger.warn(`[MCP][${serverName}] App-level connection reconnection failed`);
        return false;
      }
    } catch (error) {
      logger.error(`[MCP][${serverName}] Error during app-level connection reconnection:`, error);
      return false;
    }
  }

  /**
   * Maps available tools from all app-level connections into the provided object.
   * The object is modified in place.
   */
  public async mapAvailableTools(availableTools: t.LCAvailableTools): Promise<void> {
    for (const [serverName, connection] of this.connections.entries()) {
      try {
        /** Attempt to ensure connection is active, with reconnection if needed */
        const isActive = await this.isConnectionActive(serverName, connection);
        if (!isActive) {
          logger.warn(`[MCP][${serverName}] Connection not available. Skipping tool mapping.`);
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
        logger.warn(`[MCP][${serverName}] Error fetching tools for mapping:`, error);
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
        /** Attempt to ensure connection is active, with reconnection if needed */
        const isActive = await this.isConnectionActive(serverName, connection);
        if (!isActive) {
          logger.warn(`[MCP][${serverName}] Connection not available. Skipping manifest loading.`);
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
        logger.error(`[MCP][${serverName}] Error fetching tools for manifest:`, error);
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
    tokenMethods,
    flowManager,
    oauthStart,
    oauthEnd,
  }: {
    serverName: string;
    toolName: string;
    provider: t.Provider;
    toolArguments?: Record<string, unknown>;
    options?: CallToolOptions;
    tokenMethods?: TokenMethods;
    flowManager?: FlowStateManager<MCPOAuthTokens>;
    oauthStart?: (authURL: string) => void;
    oauthEnd?: () => void;
  }): Promise<t.FormattedToolResponse> {
    /** User-specific connection */
    let connection: MCPConnection | undefined;
    const { user, ...callOptions } = options ?? {};
    const userId = user?.id;
    const logPrefix = userId ? `[MCP][User: ${userId}][${serverName}]` : `[MCP][${serverName}]`;

    try {
      if (userId && user) {
        this.updateUserLastActivity(userId);
        /** Get or create user-specific connection */
        connection = await this.getUserConnection({
          user,
          serverName,
          flowManager,
          tokenMethods,
          oauthStart,
          oauthEnd,
        });
      } else {
        /** App-level connection */
        connection = this.connections.get(serverName);
        if (!connection) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `${logPrefix} No app-level connection found. Cannot execute tool ${toolName}.`,
          );
        }
      }

      if (!(await connection.isConnected())) {
        /** May happen if getUserConnection failed silently or app connection dropped */
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
      logger.error(`${logPrefix}[${toolName}] Tool call failed`, error);
      // Rethrowing allows the caller (createMCPTool) to handle the final user message
      throw error;
    }
  }

  /** Disconnects a specific app-level server */
  public async disconnectServer(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (connection) {
      logger.info(`[MCP][${serverName}] Disconnecting...`);
      await connection.disconnect();
      this.connections.delete(serverName);
    }
  }

  /** Disconnects all app-level and user-level connections */
  public async disconnectAll(): Promise<void> {
    logger.info('[MCP] Disconnecting all app-level and user-level connections...');

    const userDisconnectPromises = Array.from(this.userConnections.keys()).map((userId) =>
      this.disconnectUserConnections(userId),
    );
    await Promise.allSettled(userDisconnectPromises);
    this.userLastActivity.clear();

    // Disconnect all app-level connections
    const appDisconnectPromises = Array.from(this.connections.values()).map((connection) =>
      connection.disconnect().catch((error) => {
        logger.error(`[MCP][${connection.serverName}] Error during disconnectAll:`, error);
      }),
    );
    await Promise.allSettled(appDisconnectPromises);
    this.connections.clear();

    logger.info('[MCP] All connections processed for disconnection.');
  }

  /** Destroys the singleton instance and disconnects all connections */
  public static async destroyInstance(): Promise<void> {
    if (MCPManager.instance) {
      await MCPManager.instance.disconnectAll();
      MCPManager.instance = null;
      logger.info('[MCP] Manager instance destroyed.');
    }
  }

  /**
   * Get instructions for MCP servers
   * @param serverNames Optional array of server names. If not provided or empty, returns all servers.
   * @returns Object mapping server names to their instructions
   */
  public getInstructions(serverNames?: string[]): Record<string, string> {
    const instructions: Record<string, string> = {};

    if (!serverNames || serverNames.length === 0) {
      // Return all instructions if no specific servers requested
      for (const [serverName, serverInstructions] of this.serverInstructions.entries()) {
        instructions[serverName] = serverInstructions;
      }
    } else {
      // Return instructions for specific servers
      for (const serverName of serverNames) {
        const serverInstructions = this.serverInstructions.get(serverName);
        if (serverInstructions) {
          instructions[serverName] = serverInstructions;
        }
      }
    }

    return instructions;
  }

  /**
   * Format MCP server instructions for injection into context
   * @param serverNames Optional array of server names to include. If not provided, includes all servers.
   * @returns Formatted instructions string ready for context injection
   */
  public formatInstructionsForContext(serverNames?: string[]): string {
    /** Instructions for specified servers or all stored instructions */
    const instructionsToInclude = this.getInstructions(serverNames);

    if (Object.keys(instructionsToInclude).length === 0) {
      return '';
    }

    // Format instructions for context injection
    const formattedInstructions = Object.entries(instructionsToInclude)
      .map(([serverName, instructions]) => {
        return `## ${serverName} MCP Server Instructions

${instructions}`;
      })
      .join('\n\n');

    return `# MCP Server Instructions

The following MCP servers are available with their specific instructions:

${formattedInstructions}

Please follow these instructions when using tools from the respective MCP servers.`;
  }

  /** Handles OAuth authentication requirements */
  private async handleOAuthRequired({
    serverName,
    serverUrl,
    flowManager,
    userId = SYSTEM_USER_ID,
    oauthStart,
    oauthEnd,
  }: {
    serverName: string;
    serverUrl?: string;
    userId?: string;
    flowManager?: FlowStateManager<MCPOAuthTokens>;
    oauthStart?: (authURL: string) => void;
    oauthEnd?: () => void;
  }): Promise<MCPOAuthTokens | null> {
    const userPart = userId ? `[User: ${userId}]` : '';
    const logPrefix = `[MCP]${userPart}[${serverName}]`;
    logger.debug(`${logPrefix} \`handleOAuthRequired\` called with serverUrl: ${serverUrl}`);

    if (!flowManager || !serverUrl) {
      logger.error(
        `${logPrefix} OAuth required but flow manager not available or server URL missing`,
      );
      logger.warn(`${logPrefix} Please configure OAuth credentials for this server`);
      return null;
    }

    try {
      const config = this.mcpConfigs[serverName];
      logger.debug(`${logPrefix} Initiating OAuth flow...`);

      const { authorizationUrl, flowId } = await MCPOAuthHandler.initiateOAuthFlow(
        serverName,
        serverUrl,
        userId,
        config?.oauth,
        flowManager,
      );

      oauthStart?.(authorizationUrl);

      logger.info(`
═══════════════════════════════════════════════════════════════════════
Please visit the following URL to authenticate:

${authorizationUrl}

${logPrefix} Flow ID: ${flowId}
═══════════════════════════════════════════════════════════════════════
`);

      /** Awaited tokens from successful OAuth completion + exchange */
      const tokens = await flowManager.createFlow(flowId, 'mcp_oauth');
      oauthEnd?.();
      logger.info(`${logPrefix} OAuth flow completed, tokens received`);
      return tokens;
    } catch (error) {
      logger.error(`${logPrefix} Failed to complete OAuth flow`, error);
      return null;
    }
  }
}
