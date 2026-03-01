import pick from 'lodash/pick';
import { logger } from '@librechat/data-schemas';
import {
  CallToolResultSchema,
  ReadResourceResultSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { TokenMethods, IUser } from '@librechat/data-schemas';
import type { GraphTokenResolver } from '~/utils/graph';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens } from './oauth';
import type { RequestBody } from '~/types';
import type * as t from './types';
import { Constants } from 'librechat-data-provider';
import { MCPServersInitializer } from './registry/MCPServersInitializer';
import { MCPServerInspector } from './registry/MCPServerInspector';
import { MCPServersRegistry } from './registry/MCPServersRegistry';
import { UserConnectionManager } from './UserConnectionManager';
import { ConnectionsRepository } from './ConnectionsRepository';
import { MCPConnectionFactory } from './MCPConnectionFactory';
import { preProcessGraphTokens } from '~/utils/graph';
import { formatToolContent } from './parsers';
import { MCPConnection } from './connection';
import { processMCPEnv } from '~/utils/env';

/**
 * Centralized manager for MCP server connections and tool execution.
 * Extends UserConnectionManager to handle both app-level and user-specific connections.
 */
export class MCPManager extends UserConnectionManager {
  private static instance: MCPManager | null;
  private readonly allToolsCache = new WeakMap<MCPConnection, t.LCAvailableTools>();
  private readonly allToolsCacheListeners = new WeakSet<MCPConnection>();

  /** Creates and initializes the singleton MCPManager instance */
  public static async createInstance(
    configs: t.MCPServers,
    options?: { enableApps?: boolean },
  ): Promise<MCPManager> {
    if (MCPManager.instance) throw new Error('MCPManager has already been initialized.');
    MCPManager.instance = new MCPManager();
    await MCPManager.instance.initialize(configs, options);
    return MCPManager.instance;
  }

  /** Returns the singleton MCPManager instance */
  public static getInstance(): MCPManager {
    if (!MCPManager.instance) throw new Error('MCPManager has not been initialized.');
    return MCPManager.instance;
  }

  /** Initializes the MCPManager by setting up server registry and app connections */
  public async initialize(configs: t.MCPServers, options?: { enableApps?: boolean }) {
    this.enableApps = options?.enableApps !== false;
    await MCPServersInitializer.initialize(configs, { enableApps: this.enableApps });
    this.appConnections = new ConnectionsRepository(undefined, undefined, this.enableApps);
  }

  /** Retrieves an app-level or user-specific connection based on provided arguments */
  public async getConnection(
    args: {
      serverName: string;
      user?: IUser;
      forceNew?: boolean;
      flowManager?: FlowStateManager<MCPOAuthTokens | null>;
    } & Omit<t.OAuthConnectionOptions, 'useOAuth' | 'user' | 'flowManager'>,
  ): Promise<MCPConnection> {
    //the get method checks if the config is still valid as app level
    const existingAppConnection = await this.appConnections!.get(args.serverName);
    if (existingAppConnection) {
      return existingAppConnection;
    } else if (args.user?.id) {
      return this.getUserConnection(args as Parameters<typeof this.getUserConnection>[0]);
    } else {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `No connection found for server ${args.serverName}`,
      );
    }
  }

  /**
   * Discovers tools from an MCP server, even when OAuth is required.
   * Per MCP spec, tool listing should be possible without authentication.
   * Use this for agent initialization to get tool schemas before OAuth flow.
   */
  public async discoverServerTools(args: t.ToolDiscoveryOptions): Promise<t.ToolDiscoveryResult> {
    const { serverName, user } = args;
    const logPrefix = user?.id ? `[MCP][User: ${user.id}][${serverName}]` : `[MCP][${serverName}]`;

    try {
      const existingAppConnection = await this.appConnections?.get(serverName);
      if (existingAppConnection && (await existingAppConnection.isConnected())) {
        const tools = await existingAppConnection.fetchTools();
        return { tools, oauthRequired: false, oauthUrl: null };
      }
    } catch {
      logger.debug(`${logPrefix} [Discovery] App connection not available, trying discovery mode`);
    }

    const serverConfig = (await MCPServersRegistry.getInstance().getServerConfig(
      serverName,
      user?.id,
    )) as t.MCPOptions | null;

    if (!serverConfig) {
      logger.warn(`${logPrefix} [Discovery] Server config not found`);
      return { tools: null, oauthRequired: false, oauthUrl: null };
    }

    const useOAuth = Boolean(
      serverConfig.requiresOAuth || (serverConfig as t.ParsedServerConfig).oauthMetadata,
    );

    const useSSRFProtection = MCPServersRegistry.getInstance().shouldEnableSSRFProtection();
    const basic: t.BasicConnectionOptions = {
      serverName,
      serverConfig,
      useSSRFProtection,
      enableApps: this.enableApps,
    };

    if (!useOAuth) {
      const result = await MCPConnectionFactory.discoverTools(basic);
      return {
        tools: result.tools,
        oauthRequired: result.oauthRequired,
        oauthUrl: result.oauthUrl,
      };
    }

    if (!user || !args.flowManager) {
      logger.warn(`${logPrefix} [Discovery] OAuth server requires user and flowManager`);
      return { tools: null, oauthRequired: true, oauthUrl: null };
    }

    const result = await MCPConnectionFactory.discoverTools(basic, {
      user,
      useOAuth: true,
      flowManager: args.flowManager,
      tokenMethods: args.tokenMethods,
      signal: args.signal,
      oauthStart: args.oauthStart,
      customUserVars: args.customUserVars,
      requestBody: args.requestBody,
      connectionTimeout: args.connectionTimeout,
    });

    return { tools: result.tools, oauthRequired: result.oauthRequired, oauthUrl: result.oauthUrl };
  }

  /** Returns all available tool functions from app-level connections */
  public async getAppToolFunctions(): Promise<t.LCAvailableTools> {
    const toolFunctions: t.LCAvailableTools = {};
    const configs = await MCPServersRegistry.getInstance().getAllServerConfigs();
    for (const config of Object.values(configs)) {
      if (config.toolFunctions != null) {
        Object.assign(toolFunctions, config.toolFunctions);
      }
    }
    return toolFunctions;
  }

  /** Returns all available tool functions from all connections available to user */
  public async getServerToolFunctions(
    userId: string,
    serverName: string,
  ): Promise<t.LCAvailableTools | null> {
    try {
      //try get the appConnection (if the config is not in the app level anymore any existing connection will disconnect and get will return null)
      const existingAppConnection = await this.appConnections?.get(serverName);
      if (existingAppConnection) {
        return MCPServerInspector.getToolFunctions(serverName, existingAppConnection);
      }

      const userConnections = this.getUserConnections(userId);
      if (!userConnections || userConnections.size === 0) {
        return null;
      }
      if (!userConnections.has(serverName)) {
        return null;
      }

      return MCPServerInspector.getToolFunctions(serverName, userConnections.get(serverName)!);
    } catch (error) {
      logger.warn(
        `[getServerToolFunctions] Error getting tool functions for server ${serverName}`,
        error,
      );
      return null;
    }
  }

  /**
   * Get instructions for MCP servers
   * @param serverNames Optional array of server names. If not provided or empty, returns all servers.
   * @returns Object mapping server names to their instructions
   */
  private async getInstructions(serverNames?: string[]): Promise<Record<string, string>> {
    const instructions: Record<string, string> = {};
    const configs = await MCPServersRegistry.getInstance().getAllServerConfigs();
    for (const [serverName, config] of Object.entries(configs)) {
      if (config.serverInstructions != null) {
        instructions[serverName] = config.serverInstructions as string;
      }
    }
    if (!serverNames) return instructions;
    return pick(instructions, serverNames);
  }

  /**
   * Format MCP server instructions for injection into context
   * @param serverNames Optional array of server names to include. If not provided, includes all servers.
   * @returns Formatted instructions string ready for context injection
   */
  public async formatInstructionsForContext(serverNames?: string[]): Promise<string> {
    /** Instructions for specified servers or all stored instructions */
    const instructionsToInclude = await this.getInstructions(serverNames);

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

  /**
   * Returns all tool functions (including app-only) for a given server connection.
   */
  private attachAllToolsCacheInvalidation(connection: MCPConnection): void {
    if (this.allToolsCacheListeners.has(connection)) {
      return;
    }

    this.allToolsCacheListeners.add(connection);
    connection.on('connectionChange', () => {
      this.allToolsCache.delete(connection);
    });
  }

  private async getAllToolsFromConnection(
    serverName: string,
    connection: MCPConnection,
  ): Promise<t.LCAvailableTools> {
    const cached = this.allToolsCache.get(connection);
    if (cached) {
      return cached;
    }

    try {
      const { allTools } = await MCPServerInspector.getAllToolFunctions(serverName, connection);
      this.allToolsCache.set(connection, allTools);
      this.attachAllToolsCacheInvalidation(connection);
      return allTools;
    } catch (error) {
      logger.warn(
        `[getAllToolsFromConnection] Error getting all tools for server ${serverName}`,
        error,
      );
      return {};
    }
  }

  /**
   * Returns all tool functions (including app-only) for a given server connection.
   */
  private async getToolsFromConnection(
    serverName: string,
    connection: MCPConnection,
  ): Promise<t.LCAvailableTools> {
    return this.getAllToolsFromConnection(serverName, connection);
  }

  /**
   * Gets an existing connection (app-level or user-specific) without creating new user connections.
   * Useful for MCP App bridge endpoints that need an already-established connection.
   */
  public async getExistingConnection(
    userId: string,
    serverName: string,
  ): Promise<MCPConnection | null> {
    try {
      const appConnection = await this.appConnections?.get(serverName);
      if (appConnection) {
        return appConnection;
      }

      const userConnections = this.getUserConnections(userId);
      if (!userConnections?.has(serverName)) {
        return null;
      }

      const connection = userConnections.get(serverName)!;
      if (await connection.isConnected()) {
        return connection;
      }

      return null;
    } catch (error) {
      logger.warn(
        `[getExistingConnection] Error getting connection for server ${serverName}`,
        error,
      );
      return null;
    }
  }

  /**
   * Returns all tool functions for a server (including app-only tools),
   * looking up the connection by userId and serverName.
   */
  public async getAllToolsForServer(
    userId: string,
    serverName: string,
  ): Promise<t.LCAvailableTools | null> {
    try {
      const appConnection = await this.appConnections?.get(serverName);
      if (appConnection) {
        return await this.getAllToolsFromConnection(serverName, appConnection);
      }

      const userConnections = this.getUserConnections(userId);
      if (!userConnections?.has(serverName)) {
        return null;
      }

      return await this.getAllToolsFromConnection(serverName, userConnections.get(serverName)!);
    } catch (error) {
      logger.warn(`[getAllToolsForServer] Error getting tools for server ${serverName}`, error);
      return null;
    }
  }

  /**
   * Reads a resource from an MCP server via an existing connection.
   * Used by the MCP App bridge to fetch UI resources.
   */
  public async readResource(userId: string, serverName: string, uri: string) {
    const connection = await this.getExistingConnection(userId, serverName);
    if (!connection) {
      throw new Error(`MCP server "${serverName}" not found or not connected`);
    }

    return connection.client.request(
      {
        method: 'resources/read',
        params: { uri },
      },
      ReadResourceResultSchema,
      { timeout: connection.timeout },
    );
  }

  /**
   * Executes a tool call from an MCP App iframe.
   * Does not perform visibility validation — callers should check tool visibility first.
   */
  public async appToolCall(
    userId: string,
    serverName: string,
    toolName: string,
    toolArguments?: Record<string, unknown>,
  ) {
    const connection = await this.getExistingConnection(userId, serverName);
    if (!connection) {
      throw new Error(`MCP server "${serverName}" not found or not connected`);
    }

    return connection.client.request(
      {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: toolArguments || {},
        },
      },
      CallToolResultSchema,
      { timeout: connection.timeout },
    );
  }

  /**
   * Calls a tool on an MCP server, using either a user-specific connection
   * (if userId is provided) or an app-level connection. Updates the last activity timestamp
   * for user-specific connections upon successful call initiation.
   *
   * @param graphTokenResolver - Optional function to resolve Graph API tokens via OBO flow.
   *   When provided and the server config contains `{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}` placeholders,
   *   they will be resolved to actual Graph API tokens before the tool call.
   */
  async callTool({
    user,
    serverName,
    toolName,
    provider,
    toolArguments,
    options,
    tokenMethods,
    requestBody,
    flowManager,
    oauthStart,
    oauthEnd,
    customUserVars,
    graphTokenResolver,
  }: {
    user?: IUser;
    serverName: string;
    toolName: string;
    provider: t.Provider;
    toolArguments?: Record<string, unknown>;
    options?: RequestOptions;
    requestBody?: RequestBody;
    tokenMethods?: TokenMethods;
    customUserVars?: Record<string, string>;
    flowManager: FlowStateManager<MCPOAuthTokens | null>;
    oauthStart?: (authURL: string) => Promise<void>;
    oauthEnd?: () => Promise<void>;
    graphTokenResolver?: GraphTokenResolver;
  }): Promise<t.FormattedToolResponse> {
    /** User-specific connection */
    let connection: MCPConnection | undefined;
    const userId = user?.id;
    const logPrefix = userId ? `[MCP][User: ${userId}][${serverName}]` : `[MCP][${serverName}]`;

    try {
      if (userId && user) this.updateUserLastActivity(userId);

      connection = await this.getConnection({
        serverName,
        user,
        flowManager,
        tokenMethods,
        oauthStart,
        oauthEnd,
        signal: options?.signal,
        customUserVars,
        requestBody,
      });

      if (!(await connection.isConnected())) {
        /** May happen if getUserConnection failed silently or app connection dropped */
        throw new McpError(
          ErrorCode.InternalError, // Use InternalError for connection issues
          `${logPrefix} Connection is not active. Cannot execute tool ${toolName}.`,
        );
      }

      const rawConfig = (await MCPServersRegistry.getInstance().getServerConfig(
        serverName,
        userId,
      )) as t.ParsedServerConfig;

      // Pre-process Graph token placeholders (async) before sync processMCPEnv
      const graphProcessedConfig = await preProcessGraphTokens(rawConfig, {
        user,
        graphTokenResolver,
        scopes: process.env.GRAPH_API_SCOPES,
      });
      const currentOptions = processMCPEnv({
        user,
        options: graphProcessedConfig,
        customUserVars: customUserVars,
        body: requestBody,
      });
      if ('headers' in currentOptions) {
        connection.setRequestHeaders(currentOptions.headers || {});
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
          resetTimeoutOnProgress: true,
          ...options,
        },
      );
      if (userId) {
        this.updateUserLastActivity(userId);
      }
      this.checkIdleConnections();

      const resultMeta = (result as t.MCPToolCallResponse)?._meta;
      const toolKey = `${toolName}${Constants.mcp_delimiter}${serverName}`;
      const configMeta = rawConfig?.toolFunctions?.[toolKey]?._meta;

      // Prefer call result metadata, then cached config metadata, then live tools/list fallback.
      let uiMeta =
        (resultMeta?.ui as { resourceUri?: string; visibility?: string[] } | undefined) ??
        (configMeta?.ui as { resourceUri?: string; visibility?: string[] } | undefined);

      if (!uiMeta) {
        const allTools = await this.getToolsFromConnection(serverName, connection);
        uiMeta = allTools?.[toolKey]?._meta?.ui as
          | { resourceUri?: string; visibility?: string[] }
          | undefined;
      }

      return formatToolContent(result as t.MCPToolCallResponse, provider, {
        toolUiMeta: uiMeta,
        serverName,
        toolArguments,
      });
    } catch (error) {
      // Log with context and re-throw or handle as needed
      logger.error(`${logPrefix}[${toolName}] Tool call failed`, error);
      // Rethrowing allows the caller (createMCPTool) to handle the final user message
      throw error;
    }
  }
}
