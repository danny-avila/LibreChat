import pick from 'lodash/pick';
import pickBy from 'lodash/pickBy';
import mapValues from 'lodash/mapValues';
import { logger } from '@librechat/data-schemas';
import type { MCPConnection } from '~/mcp/connection';
import type { JsonSchemaType } from '~/types';
import type * as t from '~/mcp/types';
import { ConnectionsRepository } from '~/mcp/ConnectionsRepository';
import { detectOAuthRequirement } from '~/mcp/oauth';
import { processMCPEnv } from '~/utils';
import { CONSTANTS } from '~/mcp/enum';

/**
 * Manages MCP server configurations and metadata discovery.
 * Fetches server capabilities, OAuth requirements, and tool definitions for registry.
 * Determines which servers are for app-level connections.
 * Has its own connections repository. All connections are disconnected after initialization.
 */
export class MCPServersRegistry {
  private initialized: boolean = false;
  private connections: ConnectionsRepository;

  public readonly rawConfigs: t.MCPServers;
  public readonly parsedConfigs: Record<string, t.ParsedServerConfig>;

  public oauthServers: Set<string> | null = null;
  public serverInstructions: Record<string, string> | null = null;
  public toolFunctions: t.LCAvailableTools | null = null;
  public appServerConfigs: t.MCPServers | null = null;

  constructor(configs: t.MCPServers) {
    this.rawConfigs = configs;
    this.parsedConfigs = mapValues(configs, (con) => processMCPEnv({ options: con }));
    this.connections = new ConnectionsRepository(configs);
  }

  /** Initializes all startup-enabled servers by gathering their metadata asynchronously */
  public async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const serverNames = Object.keys(this.parsedConfigs);

    await Promise.allSettled(serverNames.map((serverName) => this.gatherServerInfo(serverName)));

    this.setOAuthServers();
    this.setServerInstructions();
    this.setAppServerConfigs();
    await this.setAppToolFunctions();

    this.connections.disconnectAll();
  }

  /** Fetches all metadata for a single server in parallel */
  private async gatherServerInfo(serverName: string): Promise<void> {
    try {
      await this.fetchOAuthRequirement(serverName);
      const config = this.parsedConfigs[serverName];

      if (config.startup !== false && !config.requiresOAuth) {
        await Promise.allSettled([
          this.fetchServerInstructions(serverName).catch((error) =>
            logger.warn(`${this.prefix(serverName)} Failed to fetch server instructions:`, error),
          ),
          this.fetchServerCapabilities(serverName).catch((error) =>
            logger.warn(`${this.prefix(serverName)} Failed to fetch server capabilities:`, error),
          ),
        ]);
      }

      this.logUpdatedConfig(serverName);
    } catch (error) {
      logger.warn(`${this.prefix(serverName)} Failed to initialize server:`, error);
    }
  }

  /** Sets app-level server configs (startup enabled, non-OAuth servers) */
  private setAppServerConfigs(): void {
    const appServers = Object.keys(
      pickBy(
        this.parsedConfigs,
        (config) => config.startup !== false && config.requiresOAuth === false,
      ),
    );
    this.appServerConfigs = pick(this.rawConfigs, appServers);
  }

  /** Creates set of server names that require OAuth authentication */
  private setOAuthServers(): Set<string> {
    if (this.oauthServers) return this.oauthServers;
    this.oauthServers = new Set(
      Object.keys(pickBy(this.parsedConfigs, (config) => config.requiresOAuth)),
    );
    return this.oauthServers;
  }

  /** Collects server instructions from all configured servers */
  private setServerInstructions(): void {
    this.serverInstructions = mapValues(
      pickBy(this.parsedConfigs, (config) => config.serverInstructions),
      (config) => config.serverInstructions as string,
    );
  }

  /** Builds registry of all available tool functions from loaded connections */
  private async setAppToolFunctions(): Promise<void> {
    const connections = (await this.connections.getLoaded()).entries();
    const allToolFunctions: t.LCAvailableTools = {};
    for (const [serverName, conn] of connections) {
      try {
        const toolFunctions = await this.getToolFunctions(serverName, conn);
        Object.assign(allToolFunctions, toolFunctions);
      } catch (error) {
        logger.warn(`${this.prefix(serverName)} Error fetching tool functions:`, error);
      }
    }
    this.toolFunctions = allToolFunctions;
  }

  /** Converts server tools to LibreChat-compatible tool functions format */
  public async getToolFunctions(
    serverName: string,
    conn: MCPConnection,
  ): Promise<t.LCAvailableTools> {
    const { tools }: t.MCPToolListResponse = await conn.client.listTools();

    const toolFunctions: t.LCAvailableTools = {};
    tools.forEach((tool) => {
      const name = `${tool.name}${CONSTANTS.mcp_delimiter}${serverName}`;
      toolFunctions[name] = {
        type: 'function',
        ['function']: {
          name,
          description: tool.description,
          parameters: tool.inputSchema as JsonSchemaType,
        },
      };
    });

    return toolFunctions;
  }

  /** Determines if server requires OAuth if not already specified in the config */
  private async fetchOAuthRequirement(serverName: string): Promise<boolean> {
    const config = this.parsedConfigs[serverName];
    if (config.requiresOAuth != null) return config.requiresOAuth;
    if (config.url == null) return (config.requiresOAuth = false);
    if (config.startup === false) return (config.requiresOAuth = false);

    const result = await detectOAuthRequirement(config.url);
    config.requiresOAuth = result.requiresOAuth;
    config.oauthMetadata = result.metadata;
    return config.requiresOAuth;
  }

  /** Retrieves server instructions from MCP server if enabled in the config */
  private async fetchServerInstructions(serverName: string): Promise<void> {
    const config = this.parsedConfigs[serverName];
    if (!config.serverInstructions) return;
    if (typeof config.serverInstructions === 'string') return;

    const conn = await this.connections.get(serverName);
    config.serverInstructions = conn.client.getInstructions();
    if (!config.serverInstructions) {
      logger.warn(`${this.prefix(serverName)} No server instructions available`);
    }
  }

  /** Fetches server capabilities and available tools list */
  private async fetchServerCapabilities(serverName: string): Promise<void> {
    const config = this.parsedConfigs[serverName];
    const conn = await this.connections.get(serverName);
    const capabilities = conn.client.getServerCapabilities();
    if (!capabilities) return;
    config.capabilities = JSON.stringify(capabilities);
    if (!capabilities.tools) return;
    const tools = await conn.client.listTools();
    config.tools = tools.tools.map((tool) => tool.name).join(', ');
  }

  // Logs server configuration summary after initialization
  private logUpdatedConfig(serverName: string): void {
    const prefix = this.prefix(serverName);
    const config = this.parsedConfigs[serverName];
    logger.info(`${prefix} -------------------------------------------------┐`);
    logger.info(`${prefix} URL: ${config.url}`);
    logger.info(`${prefix} OAuth Required: ${config.requiresOAuth}`);
    logger.info(`${prefix} Capabilities: ${config.capabilities}`);
    logger.info(`${prefix} Tools: ${config.tools}`);
    logger.info(`${prefix} Server Instructions: ${config.serverInstructions}`);
    logger.info(`${prefix} -------------------------------------------------┘`);
  }

  // Returns formatted log prefix for server messages
  private prefix(serverName: string): string {
    return `[MCP][${serverName}]`;
  }
}
