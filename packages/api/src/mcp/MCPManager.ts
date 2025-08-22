import pick from 'lodash/pick';
import { EventEmitter } from 'events';
import { logger } from '@librechat/data-schemas';
import { CallToolResultSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { TokenMethods } from '@librechat/data-schemas';
import type { FlowStateManager } from '~/flow/manager';
import type { TUser, ElicitationState, ElicitationResponse } from 'librechat-data-provider';
import type { MCPOAuthTokens } from '~/mcp/oauth';
import type { RequestBody } from '~/types';
import type * as t from './types';
import { UserConnectionManager } from '~/mcp/UserConnectionManager';
import { ConnectionsRepository } from '~/mcp/ConnectionsRepository';
import { formatToolContent } from './parsers';
import { MCPConnection } from './connection';
import { processMCPEnv } from '~/utils/env';
import { CONSTANTS } from './enum';

/**
 * Centralized manager for MCP server connections and tool execution.
 * Extends UserConnectionManager to handle both app-level and user-specific connections.
 */
export class MCPManager extends UserConnectionManager {
  private static instance: MCPManager | null;
  // Connections shared by all users.
  private appConnections: ConnectionsRepository | null = null;
  // EventEmitter functionality for elicitation events
  private eventEmitter: EventEmitter = new EventEmitter();
  // Elicitation state storage
  private elicitationStates: Map<string, ElicitationState> = new Map();
  // Pending elicitation resolvers
  private pendingElicitations: Map<string, (response: unknown) => void> = new Map();

  /** Creates and initializes the singleton MCPManager instance */
  public static async createInstance(configs: t.MCPServers): Promise<MCPManager> {
    if (MCPManager.instance) throw new Error('MCPManager has already been initialized.');
    MCPManager.instance = new MCPManager(configs);
    await MCPManager.instance.initialize();
    return MCPManager.instance;
  }

  /** Returns the singleton MCPManager instance */
  public static getInstance(): MCPManager {
    if (!MCPManager.instance) throw new Error('MCPManager has not been initialized.');
    return MCPManager.instance;
  }

  /** Initializes the MCPManager by setting up server registry and app connections */
  public async initialize() {
    await this.serversRegistry.initialize();
    this.appConnections = new ConnectionsRepository(this.serversRegistry.appServerConfigs!);

    // Don't set up elicitation handlers here - they will be set up during tool execution
    // when we have the proper userId context
  }

  /** Returns all app-level connections */
  public async getAllConnections(): Promise<Map<string, MCPConnection> | null> {
    return this.appConnections!.getAll();
  }

  /** Get servers that require OAuth */
  public getOAuthServers(): Set<string> | null {
    return this.serversRegistry.oauthServers!;
  }

  /** Returns all available tool functions from app-level connections */
  public getAppToolFunctions(): t.LCAvailableTools | null {
    return this.serversRegistry.toolFunctions!;
  }
  /** Returns all available tool functions from all connections available to user */
  public async getAllToolFunctions(userId: string): Promise<t.LCAvailableTools | null> {
    const allToolFunctions: t.LCAvailableTools = this.getAppToolFunctions() ?? {};
    const userConnections = this.getUserConnections(userId);
    if (!userConnections || userConnections.size === 0) {
      return allToolFunctions;
    }

    for (const [serverName, connection] of userConnections.entries()) {
      const toolFunctions = await this.serversRegistry.getToolFunctions(serverName, connection);
      Object.assign(allToolFunctions, toolFunctions);
    }

    return allToolFunctions;
  }

  /**
   * Get instructions for MCP servers
   * @param serverNames Optional array of server names. If not provided or empty, returns all servers.
   * @returns Object mapping server names to their instructions
   */
  public getInstructions(serverNames?: string[]): Record<string, string> {
    const instructions = this.serversRegistry.serverInstructions!;
    if (!serverNames) return instructions;
    return pick(instructions, serverNames);
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

  private async loadAppManifestTools(): Promise<t.LCManifestTool[]> {
    const connections = await this.appConnections!.getAll();
    return await this.loadManifestTools(connections);
  }

  private async loadUserManifestTools(userId: string): Promise<t.LCManifestTool[]> {
    const connections = this.getUserConnections(userId);
    return await this.loadManifestTools(connections);
  }

  public async loadAllManifestTools(userId: string): Promise<t.LCManifestTool[]> {
    const appTools = await this.loadAppManifestTools();
    const userTools = await this.loadUserManifestTools(userId);
    return [...appTools, ...userTools];
  }

  /** Loads tools from all app-level connections into the manifest. */
  private async loadManifestTools(
    connections?: Map<string, MCPConnection> | null,
  ): Promise<t.LCToolManifest> {
    const mcpTools: t.LCManifestTool[] = [];
    if (!connections || connections.size === 0) {
      return mcpTools;
    }
    for (const [serverName, connection] of connections.entries()) {
      try {
        if (!(await connection.isConnected())) {
          logger.warn(
            `[MCP][${serverName}] Connection not available for ${serverName} manifest tools.`,
          );
          continue;
        }

        const tools = await connection.fetchTools();
        const serverTools: t.LCManifestTool[] = [];
        for (const tool of tools) {
          const pluginKey = `${tool.name}${CONSTANTS.mcp_delimiter}${serverName}`;

          const config = this.serversRegistry.parsedConfigs[serverName];
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
    requestBody,
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
    requestBody?: RequestBody;
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
      if (!this.appConnections?.has(serverName) && userId && user) {
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
          requestBody,
        });
      } else {
        /** App-level connection */
        connection = await this.appConnections!.get(serverName);
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

      // Ensure elicitation handler is set up for this connection with the current userId
      this.setupConnectionElicitationHandler(connection, serverName, userId);

      const rawConfig = this.getRawConfig(serverName) as t.MCPOptions;
      const currentOptions = processMCPEnv({
        user,
        options: rawConfig,
        customUserVars: customUserVars,
        body: requestBody,
      });
      if ('headers' in currentOptions) {
        connection.setRequestHeaders(currentOptions.headers || {});
      }

      // Set the current tool_call_id on the connection for elicitation context
      const toolCallId = (options as { tool_call_id?: string })?.tool_call_id;
      if (toolCallId) {
        connection.setCurrentToolCallId(toolCallId);
        logger.debug(`[MCP][${serverName}] Set tool_call_id on connection: ${toolCallId}`);
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

      // Clear the tool_call_id after the request completes
      if (toolCallId) {
        connection.clearCurrentToolCallId();
        logger.debug(`[MCP][${serverName}] Cleared tool_call_id from connection`);
      }

      if (userId) {
        this.updateUserLastActivity(userId);
      }
      this.checkIdleConnections();
      return formatToolContent(result as t.MCPToolCallResponse, provider);
    } catch (error) {
      // Log with context and re-throw or handle as needed
      logger.error(`${logPrefix}[${toolName}] Tool call failed`, error);
      // Rethrowing allows the caller (createMCPTool) to handle the final user message
      throw error;
    }
  }

  // EventEmitter methods delegation
  on(event: string, listener: (...args: unknown[]) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }

  removeListener(event: string, listener: (...args: unknown[]) => void): this {
    this.eventEmitter.removeListener(event, listener);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    return this.eventEmitter.emit(event, ...args);
  }

  // Elicitation state management methods
  getElicitationState(elicitationId: string): ElicitationState | undefined {
    return this.elicitationStates.get(elicitationId);
  }

  setElicitationState(elicitationId: string, state: ElicitationState): void {
    this.elicitationStates.set(elicitationId, state);
    // Emit elicitationCreated event
    const eventData = {
      elicitationId,
      userId: state.userId,
      serverName: state.serverName,
    };
    logger.info(`[MCP] Emitting elicitationCreated event:`, eventData);
    this.emit('elicitationCreated', eventData);
  }

  respondToElicitation(elicitationId: string, response: ElicitationResponse): boolean {
    const state = this.elicitationStates.get(elicitationId);
    const resolver = this.pendingElicitations.get(elicitationId);

    if (!state) {
      logger.warn(`[MCP] Elicitation ${elicitationId} not found`);
      return false;
    }

    try {
      // Send the response back to the MCP server via the resolver
      if (resolver) {
        resolver(response);
        this.pendingElicitations.delete(elicitationId);
      }

      // Clean up the state
      this.elicitationStates.delete(elicitationId);
      logger.info(
        `[MCP] Responded to elicitation ${elicitationId} with action: ${response.action}`,
      );
      return true;
    } catch (error) {
      logger.error(`[MCP] Error responding to elicitation ${elicitationId}:`, error);
      return false;
    }
  }

  // Clean up elicitation states (optional, for memory management)
  cleanupExpiredElicitations(maxAge: number = 30 * 60 * 1000): void {
    const now = Date.now();
    for (const [id, state] of this.elicitationStates.entries()) {
      if (now - state.timestamp > maxAge) {
        this.elicitationStates.delete(id);
        logger.debug(`[MCP] Cleaned up expired elicitation ${id}`);
      }
    }
  }

  // Track which connections already have elicitation handlers set up
  private handlerSetupMap: Map<MCPConnection, string> = new Map();

  private setupConnectionElicitationHandler(
    connection: MCPConnection,
    serverName: string,
    contextUserId?: string,
  ): void {
    // Check if we already have a handler set up for this connection with this userId
    const existingUserId = this.handlerSetupMap.get(connection);
    if (existingUserId === contextUserId) {
      // Handler already set up with the same userId, no need to recreate
      return;
    }

    // Remove any existing listeners to avoid duplicates
    connection.removeAllListeners('elicitationRequest');

    // Track this setup
    if (contextUserId) {
      this.handlerSetupMap.set(connection, contextUserId);
    }

    connection.on(
      'elicitationRequest',
      (eventData: {
        serverName: string;
        userId: string;
        request: unknown;
        resolve: (response: unknown) => void;
        context: { tool_call_id?: string };
      }) => {
        // Use the contextUserId if the connection doesn't have a userId (app-level connections)
        const effectiveUserId = eventData.userId || contextUserId;

        if (!effectiveUserId) {
          logger.warn(`[MCP][${serverName}] No userId available for elicitation request, skipping`);
          return;
        }

        logger.info(
          `[MCP][${serverName}] Received elicitation request for user ${effectiveUserId} (original: ${eventData.userId}, context: ${contextUserId})`,
        );
        logger.info(`[MCP][${serverName}] Event context:`, eventData.context);

        const elicitationId = `${serverName}_${effectiveUserId}_${Date.now()}`;
        const toolCallId = eventData.context?.tool_call_id;

        logger.info(`[MCP][${serverName}] Tool call ID: ${toolCallId}`);

        // Create elicitation state
        const elicitationState: ElicitationState = {
          id: elicitationId,
          serverName: eventData.serverName,
          userId: effectiveUserId,
          request: eventData.request as ElicitationState['request'],
          timestamp: Date.now(),
          tool_call_id: toolCallId,
        } as ElicitationState;

        logger.info(`[MCP][${serverName}] Created elicitation state:`, elicitationState);

        // Store the resolver for later use
        this.pendingElicitations.set(elicitationId, eventData.resolve);

        logger.info(
          `[MCP][${serverName}] Storing elicitation state and emitting elicitationCreated event for user ${effectiveUserId}`,
        );

        // Store the state and emit elicitationCreated event
        this.setElicitationState(elicitationId, elicitationState);

        // Don't resolve immediately - wait for user response via respondToElicitation
      },
    );

    logger.debug(
      `[MCP][${serverName}] Set up elicitation handler for connection with contextUserId: ${contextUserId}`,
    );
  }

  // Override getUserConnection to set up elicitation handlers for user connections
  public override async getUserConnection(
    params: Parameters<UserConnectionManager['getUserConnection']>[0],
  ): Promise<MCPConnection> {
    const connection = await super.getUserConnection(params);

    // Set up elicitation handler for this user connection
    if (connection && params.user?.id) {
      this.setupConnectionElicitationHandler(connection, params.serverName, params.user.id);
    }

    return connection;
  }
}
