import pick from 'lodash/pick';
import { logger } from '@librechat/data-schemas';
import { CallToolResultSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { TokenMethods } from '@librechat/data-schemas';
import type { FlowStateManager } from '~/flow/manager';
import type { TUser } from 'librechat-data-provider';
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
      return formatToolContent(result as t.MCPToolCallResponse, provider);
    } catch (error) {
      // Log with context and re-throw or handle as needed
      logger.error(`${logPrefix}[${toolName}] Tool call failed`, error);
      // Rethrowing allows the caller (createMCPTool) to handle the final user message
      throw error;
    }
  }
}
