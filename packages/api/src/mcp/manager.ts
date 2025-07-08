import { logger } from '@librechat/data-schemas';
import { CallToolResultSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { OAuthClientInformation } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { JsonSchemaType, TUser } from 'librechat-data-provider';
import type { TokenMethods } from '@librechat/data-schemas';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens, MCPOAuthFlowMetadata } from './oauth/types';
import type { FlowMetadata } from '~/flow/types';
import type * as t from './types';
import { CONSTANTS, isSystemUserId } from './enum';
import { MCPOAuthHandler } from './oauth/handler';
import { MCPTokenStorage } from './oauth/tokens';
import { formatToolContent } from './parsers';
import { MCPConnection } from './connection';
import { processMCPEnv } from '~/utils/env';

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
  public async initializeMCP({
    mcpServers,
    flowManager,
    tokenMethods,
  }: {
    mcpServers: t.MCPServers;
    flowManager: FlowStateManager<MCPOAuthTokens | null>;
    tokenMethods?: TokenMethods;
  }): Promise<void> {
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
        const config = processMCPEnv(_config);

        /** Existing tokens for system-level connections */
        let tokens: MCPOAuthTokens | null = null;
        if (tokenMethods?.findToken) {
          try {
            /** Refresh function for app-level connections */
            const refreshTokensFunction = async (
              refreshToken: string,
              metadata: {
                userId: string;
                serverName: string;
                identifier: string;
                clientInfo?: OAuthClientInformation;
              },
            ) => {
              /** URL from config if available */
              const serverUrl = (config as t.SSEOptions | t.StreamableHTTPOptions).url;
              return await MCPOAuthHandler.refreshOAuthTokens(
                refreshToken,
                {
                  serverName: metadata.serverName,
                  serverUrl,
                  clientInfo: metadata.clientInfo,
                },
                config.oauth,
              );
            };

            /** Flow state to prevent concurrent token operations */
            const tokenFlowId = `tokens:${CONSTANTS.SYSTEM_USER_ID}:${serverName}`;
            tokens = await flowManager.createFlowWithHandler(
              tokenFlowId,
              'mcp_get_tokens',
              async () => {
                return await MCPTokenStorage.getTokens({
                  userId: CONSTANTS.SYSTEM_USER_ID,
                  serverName,
                  findToken: tokenMethods.findToken,
                  refreshTokens: refreshTokensFunction,
                  createToken: tokenMethods.createToken,
                  updateToken: tokenMethods.updateToken,
                });
              },
            );
          } catch {
            logger.debug(`[MCP][${serverName}] No existing tokens found`);
          }
        }

        if (tokens) {
          logger.info(`[MCP][${serverName}] Loaded OAuth tokens`);
        }

        const connection = new MCPConnection(serverName, config, undefined, tokens);

        /** Listen for OAuth requirements */
        logger.info(`[MCP][${serverName}] Setting up OAuth event listener`);
        connection.on('oauthRequired', async (data) => {
          logger.debug(`[MCP][${serverName}] oauthRequired event received`);
          const result = await this.handleOAuthRequired({
            ...data,
            flowManager,
          });

          if (result?.tokens && tokenMethods?.createToken) {
            try {
              connection.setOAuthTokens(result.tokens);
              await MCPTokenStorage.storeTokens({
                userId: CONSTANTS.SYSTEM_USER_ID,
                serverName,
                tokens: result.tokens,
                createToken: tokenMethods.createToken,
                updateToken: tokenMethods.updateToken,
                findToken: tokenMethods.findToken,
                clientInfo: result.clientInfo,
              });
              logger.info(`[MCP][${serverName}] OAuth tokens saved to storage`);
            } catch (error) {
              logger.error(`[MCP][${serverName}] Failed to save OAuth tokens to storage`, error);
            }
          }

          // Only emit oauthHandled if we actually got tokens (OAuth succeeded)
          if (result?.tokens) {
            connection.emit('oauthHandled');
          } else {
            // OAuth failed, emit oauthFailed to properly reject the promise
            logger.warn(`[MCP][${serverName}] OAuth failed, emitting oauthFailed event`);
            connection.emit('oauthFailed', new Error('OAuth authentication failed'));
          }
        });

        try {
          const connectTimeout = config.initTimeout ?? 30000;
          const connectionTimeout = new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Connection timeout after ${connectTimeout}ms`)),
              connectTimeout,
            ),
          );

          const connectionAttempt = this.initializeServer({
            connection,
            logPrefix: `[MCP][${serverName}]`,
            flowManager,
            handleOAuth: false,
          });
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
  private async initializeServer({
    connection,
    logPrefix,
    flowManager,
    handleOAuth = true,
  }: {
    connection: MCPConnection;
    logPrefix: string;
    flowManager: FlowStateManager<MCPOAuthTokens | null>;
    handleOAuth?: boolean;
  }): Promise<void> {
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
    customUserVars,
    tokenMethods,
    oauthStart,
    oauthEnd,
    signal,
  }: {
    user: TUser;
    serverName: string;
    flowManager: FlowStateManager<MCPOAuthTokens | null>;
    customUserVars?: Record<string, string>;
    tokenMethods?: TokenMethods;
    oauthStart?: (authURL: string) => Promise<void>;
    oauthEnd?: () => Promise<void>;
    signal?: AbortSignal;
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

    config = { ...(processMCPEnv(config, user, customUserVars) ?? {}) };
    /** If no in-memory tokens, tokens from persistent storage */
    let tokens: MCPOAuthTokens | null = null;
    if (tokenMethods?.findToken) {
      try {
        /** Refresh function for user-specific connections */
        const refreshTokensFunction = async (
          refreshToken: string,
          metadata: {
            userId: string;
            serverName: string;
            identifier: string;
            clientInfo?: OAuthClientInformation;
          },
        ) => {
          /** URL from config since connection doesn't exist yet */
          const serverUrl = (config as t.SSEOptions | t.StreamableHTTPOptions).url;
          return await MCPOAuthHandler.refreshOAuthTokens(
            refreshToken,
            {
              serverName: metadata.serverName,
              serverUrl,
              clientInfo: metadata.clientInfo,
            },
            config.oauth,
          );
        };

        /** Flow state to prevent concurrent token operations */
        const tokenFlowId = `tokens:${userId}:${serverName}`;
        tokens = await flowManager.createFlowWithHandler(
          tokenFlowId,
          'mcp_get_tokens',
          async () => {
            return await MCPTokenStorage.getTokens({
              userId,
              serverName,
              findToken: tokenMethods.findToken,
              refreshTokens: refreshTokensFunction,
              createToken: tokenMethods.createToken,
              updateToken: tokenMethods.updateToken,
            });
          },
          signal,
        );
      } catch (error) {
        logger.error(
          `[MCP][User: ${userId}][${serverName}] Error loading OAuth tokens from storage`,
          error,
        );
      }
    }

    if (tokens) {
      logger.info(`[MCP][User: ${userId}][${serverName}] Loaded OAuth tokens`);
    }

    connection = new MCPConnection(serverName, config, userId, tokens);

    connection.on('oauthRequired', async (data) => {
      logger.info(`[MCP][User: ${userId}][${serverName}] oauthRequired event received`);
      const result = await this.handleOAuthRequired({
        ...data,
        flowManager,
        oauthStart,
        oauthEnd,
      });

      if (result?.tokens && tokenMethods?.createToken) {
        try {
          connection?.setOAuthTokens(result.tokens);
          await MCPTokenStorage.storeTokens({
            userId,
            serverName,
            tokens: result.tokens,
            createToken: tokenMethods.createToken,
            updateToken: tokenMethods.updateToken,
            findToken: tokenMethods.findToken,
            clientInfo: result.clientInfo,
          });
          logger.info(`[MCP][User: ${userId}][${serverName}] OAuth tokens saved to storage`);
        } catch (error) {
          logger.error(
            `[MCP][User: ${userId}][${serverName}] Failed to save OAuth tokens to storage`,
            error,
          );
        }
      }

      // Only emit oauthHandled if we actually got tokens (OAuth succeeded)
      if (result?.tokens) {
        connection?.emit('oauthHandled');
      } else {
        // OAuth failed, emit oauthFailed to properly reject the promise
        logger.warn(
          `[MCP][User: ${userId}][${serverName}] OAuth failed, emitting oauthFailed event`,
        );
        connection?.emit('oauthFailed', new Error('OAuth authentication failed'));
      }
    });

    try {
      const connectTimeout = config.initTimeout ?? 30000;
      const connectionTimeout = new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Connection timeout after ${connectTimeout}ms`)),
          connectTimeout,
        ),
      );
      const connectionAttempt = this.initializeServer({
        connection,
        logPrefix: `[MCP][User: ${userId}][${serverName}]`,
        flowManager,
      });
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
  private async isConnectionActive({
    serverName,
    connection,
    flowManager,
    skipReconnect = false,
  }: {
    serverName: string;
    connection: MCPConnection;
    flowManager: FlowStateManager<MCPOAuthTokens | null>;
    skipReconnect?: boolean;
  }): Promise<boolean> {
    if (await connection.isConnected()) {
      return true;
    }

    if (skipReconnect) {
      logger.warn(
        `[MCP][${serverName}] App-level connection is disconnected, skipping reconnection attempt`,
      );
      return false;
    }

    logger.warn(
      `[MCP][${serverName}] App-level connection disconnected, attempting to reconnect...`,
    );

    try {
      const config = this.mcpConfigs[serverName];
      if (!config) {
        logger.error(`[MCP][${serverName}] Configuration not found for reconnection`);
        return false;
      }

      await this.initializeServer({
        connection,
        logPrefix: `[MCP][${serverName}]`,
        flowManager,
      });

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
  public async mapAvailableTools(
    availableTools: t.LCAvailableTools,
    flowManager: FlowStateManager<MCPOAuthTokens | null>,
  ): Promise<void> {
    for (const [serverName, connection] of this.connections.entries()) {
      try {
        /** Attempt to ensure connection is active, with reconnection if needed */
        const isActive = await this.isConnectionActive({ serverName, connection, flowManager });
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
        logger.warn(`[MCP][${serverName}] Error fetching tools`, error);
      }
    }
  }

  /**
   * Loads tools from all app-level connections into the manifest.
   */
  public async loadManifestTools({
    flowManager,
    serverToolsCallback,
    getServerTools,
  }: {
    flowManager: FlowStateManager<MCPOAuthTokens | null>;
    serverToolsCallback?: (serverName: string, tools: t.LCManifestTool[]) => Promise<void>;
    getServerTools?: (serverName: string) => Promise<t.LCManifestTool[] | undefined>;
  }): Promise<t.LCToolManifest> {
    const mcpTools: t.LCManifestTool[] = [];
    for (const [serverName, connection] of this.connections.entries()) {
      try {
        /** Attempt to ensure connection is active, with reconnection if needed */
        const isActive = await this.isConnectionActive({
          serverName,
          connection,
          flowManager,
          skipReconnect: true,
        });
        if (!isActive) {
          logger.warn(
            `[MCP][${serverName}] Connection not available for ${serverName} manifest tools.`,
          );
          if (typeof getServerTools !== 'function') {
            logger.warn(
              `[MCP][${serverName}] No \`getServerTools\` function provided, skipping tool loading.`,
            );
            continue;
          }
          const serverTools = await getServerTools(serverName);
          if (serverTools && serverTools.length > 0) {
            logger.info(`[MCP][${serverName}] Loaded tools from cache for manifest`);
            mcpTools.push(...serverTools);
          }
          continue;
        }

        const tools = await connection.fetchTools();
        const serverTools: t.LCManifestTool[] = [];
        for (const tool of tools) {
          const pluginKey = `${tool.name}${CONSTANTS.mcp_delimiter}${serverName}`;

          const config = this.mcpConfigs[serverName];
          const manifestTool: t.LCManifestTool = {
            name: tool.name,
            pluginKey,
            description: tool.description ?? '',
            icon: connection.iconPath,
            authConfig: config?.customUserVars
              ? Object.entries(config.customUserVars).map(([key, value]) => ({
                  authField: key,
                  label: value.title || key,
                  description: value.description || '',
                }))
              : undefined,
          };
          if (config?.chatMenu === false) {
            manifestTool.chatMenu = false;
          }
          mcpTools.push(manifestTool);
          serverTools.push(manifestTool);
        }
        if (typeof serverToolsCallback === 'function') {
          await serverToolsCallback(serverName, serverTools);
        }
      } catch (error) {
        logger.error(`[MCP][${serverName}] Error fetching tools for manifest:`, error);
      }
    }

    return mcpTools;
  }

  /**
   * Calls a tool on an MCP server, using either a user-specific connection
   * (if userId is provided) or an app-level connection. Updates the last activity timestamp
   * for user-specific connections upon successful call initiation.
   */
  async callTool({
    user,
    serverName,
    toolName,
    provider,
    toolArguments,
    options,
    tokenMethods,
    flowManager,
    oauthStart,
    oauthEnd,
    customUserVars,
  }: {
    user?: TUser;
    serverName: string;
    toolName: string;
    provider: t.Provider;
    toolArguments?: Record<string, unknown>;
    options?: RequestOptions;
    tokenMethods?: TokenMethods;
    customUserVars?: Record<string, string>;
    flowManager: FlowStateManager<MCPOAuthTokens | null>;
    oauthStart?: (authURL: string) => Promise<void>;
    oauthEnd?: () => Promise<void>;
  }): Promise<t.FormattedToolResponse> {
    /** User-specific connection */
    let connection: MCPConnection | undefined;
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
          signal: options?.signal,
          customUserVars,
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
          ...options,
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
    userId = CONSTANTS.SYSTEM_USER_ID,
    oauthStart,
    oauthEnd,
  }: {
    serverName: string;
    flowManager: FlowStateManager<MCPOAuthTokens | null>;
    userId?: string;
    serverUrl?: string;
    oauthStart?: (authURL: string) => Promise<void>;
    oauthEnd?: () => Promise<void>;
  }): Promise<{ tokens: MCPOAuthTokens | null; clientInfo?: OAuthClientInformation } | null> {
    const userPart = isSystemUserId(userId) ? '' : `[User: ${userId}]`;
    const logPrefix = `[MCP]${userPart}[${serverName}]`;
    logger.debug(`${logPrefix} \`handleOAuthRequired\` called with serverUrl: ${serverUrl}`);

    if (!flowManager || !serverUrl) {
      logger.error(
        `${logPrefix} OAuth required but flow manager not available or server URL missing for ${serverName}`,
      );
      logger.warn(`${logPrefix} Please configure OAuth credentials for ${serverName}`);
      return null;
    }

    try {
      const config = this.mcpConfigs[serverName];
      logger.debug(`${logPrefix} Checking for existing OAuth flow for ${serverName}...`);

      /** Flow ID to check if a flow already exists */
      const flowId = MCPOAuthHandler.generateFlowId(userId, serverName);

      /** Check if there's already an ongoing OAuth flow for this flowId */
      const existingFlow = await flowManager.getFlowState(flowId, 'mcp_oauth');
      if (existingFlow && existingFlow.status === 'PENDING') {
        logger.debug(
          `${logPrefix} OAuth flow already exists for ${flowId}, waiting for completion`,
        );
        /** Tokens from existing flow to complete */
        const tokens = await flowManager.createFlow(flowId, 'mcp_oauth');
        if (typeof oauthEnd === 'function') {
          await oauthEnd();
        }
        logger.info(`${logPrefix} OAuth flow completed, tokens received for ${serverName}`);

        /** Client information from the existing flow metadata */
        const existingMetadata = existingFlow.metadata as unknown as MCPOAuthFlowMetadata;
        const clientInfo = existingMetadata?.clientInfo;

        return { tokens, clientInfo };
      }

      logger.debug(`${logPrefix} Initiating new OAuth flow for ${serverName}...`);
      const {
        authorizationUrl,
        flowId: newFlowId,
        flowMetadata,
      } = await MCPOAuthHandler.initiateOAuthFlow(serverName, serverUrl, userId, config?.oauth);

      if (typeof oauthStart === 'function') {
        logger.info(`${logPrefix} OAuth flow started, issued authorization URL to user`);
        await oauthStart(authorizationUrl);
      } else {
        logger.info(`
═══════════════════════════════════════════════════════════════════════
Please visit the following URL to authenticate:

${authorizationUrl}

${logPrefix} Flow ID: ${newFlowId}
═══════════════════════════════════════════════════════════════════════
`);
      }

      /** Tokens from the new flow */
      const tokens = await flowManager.createFlow(
        newFlowId,
        'mcp_oauth',
        flowMetadata as FlowMetadata,
      );
      if (typeof oauthEnd === 'function') {
        await oauthEnd();
      }
      logger.info(`${logPrefix} OAuth flow completed, tokens received for ${serverName}`);

      /** Client information from the flow metadata */
      const clientInfo = flowMetadata?.clientInfo;

      return { tokens, clientInfo };
    } catch (error) {
      logger.error(`${logPrefix} Failed to complete OAuth flow for ${serverName}`, error);
      return null;
    }
  }
}
