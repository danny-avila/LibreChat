import { logger } from '@librechat/data-schemas';
import { CallToolResultSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { JsonSchemaType, MCPOptions, TUser } from 'librechat-data-provider';
import type { OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
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
  /** Store OAuth tokens for user connections */
  private userOAuthTokens: Map<string, Map<string, OAuthTokens>> = new Map();
  /** OAuth handler for managing OAuth flows */
  private oauthHandler?: MCPOAuthHandler;
  /** Flow manager for OAuth state */
  private flowManager?: FlowStateManager<MCPOAuthTokens>;
  /** Token storage for managing tokens */
  private tokenStorage?: MCPTokenStorage;

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
    this.flowManager = flowManager as FlowStateManager<MCPOAuthTokens> | undefined;

    logger.debug('[MCP] Flow manager provided:', !!flowManager);
    logger.debug('[MCP] Token methods provided:', !!tokenMethods);
    logger.debug('[MCP] Creating OAuth handler:', !!flowManager);

    if (flowManager) {
      this.oauthHandler = new MCPOAuthHandler(flowManager as FlowStateManager<MCPOAuthTokens>);
      logger.info('[MCP] OAuth handler created successfully');
    } else {
      logger.info('[MCP] No flow manager provided, OAuth will not be available');
    }

    if (tokenMethods) {
      this.tokenStorage = new MCPTokenStorage(tokenMethods);
      logger.info('[MCP] Token storage created successfully');
    } else {
      logger.info('[MCP] No token methods provided, token persistence will not be available');
    }

    const entries = Object.entries(mcpServers);
    const initializedServers = new Set();
    const connectionResults = await Promise.allSettled(
      entries.map(async ([serverName, _config], i) => {
        /** Process env for app-level connections */
        const config = this.processMCPEnv ? this.processMCPEnv(_config) : _config;

        /** Existing tokens for system-level connections */
        let existingTokens: OAuthTokens | undefined;
        if (this.tokenStorage) {
          try {
            const tokens = await this.tokenStorage.getTokens(SYSTEM_USER_ID, serverName);
            if (tokens) {
              existingTokens = tokens;
              logger.info(`[MCP][${serverName}] Loaded existing OAuth tokens`);
            }
          } catch {
            logger.debug(`[MCP][${serverName}] No existing tokens found`);
          }
        }

        const connection = new MCPConnection(serverName, config, undefined, existingTokens);

        /** Listen for OAuth requirements */
        logger.info(`[MCP][${serverName}] Setting up OAuth event listener`);
        connection.on('oauthRequired', async (data) => {
          logger.info(`[MCP][${serverName}] oauthRequired event received`);
          const tokens = await this.handleOAuthRequired(data);

          if (tokens) {
            // Set the tokens on the connection
            connection.setOAuthTokens(tokens);
            // Store tokens for system-level connections
            this.storeUserOAuthTokens(SYSTEM_USER_ID, serverName, tokens);

            if (this.tokenStorage) {
              try {
                await this.tokenStorage.storeTokens(SYSTEM_USER_ID, serverName, tokens);
                logger.info(`[MCP][${serverName}] OAuth tokens saved to storage`);
              } catch (error) {
                logger.error(`[MCP][${serverName}] Failed to save OAuth tokens to storage`, error);
              }
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
          );
          await Promise.race([connectionAttempt, connectionTimeout]);

          if (await connection.isConnected()) {
            initializedServers.add(i);
            this.connections.set(serverName, connection); // Store in app-level map

            // Handle unified serverInstructions configuration
            const configInstructions = config.serverInstructions;

            if (configInstructions !== undefined) {
              if (typeof configInstructions === 'string') {
                // Custom instructions provided
                this.serverInstructions.set(serverName, configInstructions);
                logger.info(
                  `[MCP][${serverName}] Custom instructions stored for context inclusion: ${configInstructions}`,
                );
              } else if (configInstructions === true) {
                // Use server-provided instructions
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
                // configInstructions is false - explicitly disabled
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
  ): Promise<void> {
    const maxAttempts = 3;
    let attempts = 0;
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

        // Check if it's an OAuth error
        if (this.isOAuthError(error)) {
          // Only handle OAuth if requested (not already handled by event listener)
          if (handleOAuth) {
            // Check if OAuth was already handled by the connection
            const errorWithFlag = error as (Error & { isOAuthError?: boolean }) | undefined;
            if (!oauthHandled && errorWithFlag?.isOAuthError) {
              // OAuth not handled yet by connection, handle it here
              oauthHandled = true;
              logger.info(`${logPrefix} Handling OAuth`);
              const serverUrl = connection.url;
              if (serverUrl) {
                await this.handleOAuthRequired({
                  serverName: connection.serverName,
                  error,
                  serverUrl,
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
  public async getUserConnection(
    serverName: string,
    user: TUser,
    oauthTokens?: OAuthTokens,
  ): Promise<MCPConnection> {
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
        // Update OAuth tokens if provided
        if (oauthTokens) {
          connection.setOAuthTokens(oauthTokens);
          this.storeUserOAuthTokens(userId, serverName, oauthTokens);
        }
        // Update timestamp on reuse
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

    // Get stored OAuth tokens if not provided
    const tokensToUse = oauthTokens || this.getUserOAuthTokens(userId, serverName);

    // If no in-memory tokens, try loading from persistent storage
    let persistentTokens: OAuthTokens | undefined;
    if (!tokensToUse && this.tokenStorage) {
      try {
        const tokens = await this.tokenStorage.getTokens(userId, serverName);
        if (tokens) {
          persistentTokens = tokens;
          logger.info(
            `[MCP][User: ${userId}][${serverName}] Loaded existing OAuth tokens from storage`,
          );
        }
      } catch (error) {
        logger.error(
          `[MCP][User: ${userId}][${serverName}] Error loading OAuth tokens from storage`,
          error,
        );
      }
    }

    const finalTokens = tokensToUse || persistentTokens;

    connection = new MCPConnection(serverName, config, userId, finalTokens);

    // Listen for OAuth requirements on user connections
    connection.on('oauthRequired', async (data) => {
      logger.info(`[MCP][User: ${userId}][${serverName}] oauthRequired event received`);
      const tokens = await this.handleOAuthRequired(data);

      if (tokens) {
        // Set the tokens on the connection
        connection?.setOAuthTokens(tokens);
        // Store tokens for user connections
        this.storeUserOAuthTokens(userId, serverName, tokens);

        // Persist tokens to storage
        if (this.tokenStorage) {
          try {
            await this.tokenStorage.storeTokens(userId, serverName, tokens);
            logger.info(`[MCP][User: ${userId}][${serverName}] OAuth tokens saved to storage`);
          } catch (error) {
            logger.error(
              `[MCP][User: ${userId}][${serverName}] Failed to save OAuth tokens to storage`,
              error,
            );
          }
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
      );
      await Promise.race([connectionAttempt, connectionTimeout]);

      if (!(await connection?.isConnected())) {
        throw new Error('Failed to establish connection after initialization attempt.');
      }

      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Map());
      }
      this.userConnections.get(userId)?.set(serverName, connection);

      // Store OAuth tokens if provided
      if (finalTokens) {
        this.storeUserOAuthTokens(userId, serverName, finalTokens);
      }

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

  /** Stores OAuth tokens for a user connection */
  private storeUserOAuthTokens(userId: string, serverName: string, tokens: OAuthTokens): void {
    if (!this.userOAuthTokens.has(userId)) {
      this.userOAuthTokens.set(userId, new Map());
    }
    this.userOAuthTokens.get(userId)?.set(serverName, tokens);
  }

  /** Gets stored OAuth tokens for a user connection */
  private getUserOAuthTokens(userId: string, serverName: string): OAuthTokens | undefined {
    return this.userOAuthTokens.get(userId)?.get(serverName);
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

    // Remove OAuth tokens
    const tokenMap = this.userOAuthTokens.get(userId);
    if (tokenMap) {
      tokenMap.delete(serverName);
      if (tokenMap.size === 0) {
        this.userOAuthTokens.delete(userId);
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

  /**
   * Maps available tools from all app-level connections into the provided object.
   * The object is modified in place.
   */
  public async mapAvailableTools(availableTools: t.LCAvailableTools): Promise<void> {
    for (const [serverName, connection] of this.connections.entries()) {
      try {
        if ((await connection.isConnected()) !== true) {
          logger.warn(`[MCP][${serverName}] Connection not established. Skipping tool mapping.`);
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
        if ((await connection.isConnected()) !== true) {
          logger.warn(
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
  }: {
    serverName: string;
    toolName: string;
    provider: t.Provider;
    toolArguments?: Record<string, unknown>;
    options?: CallToolOptions;
  }): Promise<t.FormattedToolResponse> {
    let connection: MCPConnection | undefined;
    const { user, ...callOptions } = options ?? {};
    const userId = user?.id;
    const logPrefix = userId ? `[MCP][User: ${userId}][${serverName}]` : `[MCP][${serverName}]`;

    try {
      if (userId && user) {
        this.updateUserLastActivity(userId);
        // Get or create user-specific connection
        connection = await this.getUserConnection(serverName, user);
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

      if (!(await connection.isConnected())) {
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
  private async handleOAuthRequired(data: {
    serverName: string;
    error: unknown;
    serverUrl?: string;
    userId?: string;
  }): Promise<MCPOAuthTokens | null> {
    const { serverName, serverUrl, userId = SYSTEM_USER_ID } = data;

    logger.info(`[MCP][${serverName}] handleOAuthRequired called with serverUrl: ${serverUrl}`);
    logger.info(`[MCP][${serverName}] OAuth handler available: ${!!this.oauthHandler}`);
    logger.info(`[MCP][${serverName}] Flow manager available: ${!!this.flowManager}`);

    if (!this.oauthHandler || !serverUrl || !this.flowManager) {
      logger.error(
        `[MCP][${serverName}] OAuth required but handler not available or server URL missing`,
      );
      logger.info(`[MCP][${serverName}] Please configure OAuth credentials for this server`);
      return null;
    }

    try {
      const config = this.mcpConfigs[serverName];
      logger.info(`[MCP][${serverName}] Initiating OAuth flow...`);

      const { authorizationUrl, flowId } = await this.oauthHandler.initiateOAuthFlow(
        serverName,
        serverUrl,
        userId, // Use the provided userId
        config?.oauth,
      );

      logger.info('═══════════════════════════════════════════════════════════════════════');
      logger.info(`[MCP][${serverName}] OAuth authentication required`);
      logger.info('');
      logger.info('Please visit the following URL to authenticate:');
      logger.info('');
      logger.info(`  ${authorizationUrl}`);
      logger.info('');
      logger.info(`Flow ID: ${flowId}`);
      logger.info('═══════════════════════════════════════════════════════════════════════');

      // Wait for the OAuth flow to complete using the flow manager
      const tokens = await this.flowManager.createFlow(flowId, 'mcp_oauth');

      logger.info(`[MCP][${serverName}] OAuth flow completed, tokens received`);
      return tokens;
    } catch (error) {
      logger.error(`[MCP][${serverName}] Failed to complete OAuth flow`, error);
      return null;
    }
  }
}
