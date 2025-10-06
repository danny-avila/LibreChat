import mapValues from 'lodash/mapValues';
import { logger } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';
import type { JsonSchemaType } from '@librechat/data-schemas';
import type { MCPConnection } from '~/mcp/connection';
import type * as t from '~/mcp/types';
import { ConnectionsRepository } from '~/mcp/ConnectionsRepository';
import { detectOAuthRequirement } from '~/mcp/oauth';
import { sanitizeUrlForLogging } from '~/mcp/utils';
import { processMCPEnv, isEnabled } from '~/utils';

const DEFAULT_MCP_INIT_TIMEOUT_MS = 30_000;

function getMCPInitTimeout(): number {
  return process.env.MCP_INIT_TIMEOUT_MS != null
    ? parseInt(process.env.MCP_INIT_TIMEOUT_MS)
    : DEFAULT_MCP_INIT_TIMEOUT_MS;
}

/**
 * Manages MCP server configurations and metadata discovery.
 * Fetches server capabilities, OAuth requirements, and tool definitions for registry.
 * Determines which servers are for app-level connections.
 * Has its own connections repository. All connections are disconnected after initialization.
 */
export class MCPServersRegistry {
  private initialized: boolean = false;
  private connections: ConnectionsRepository;
  private initTimeoutMs: number;

  public readonly rawConfigs: t.MCPServers;
  public readonly parsedConfigs: Record<string, t.ParsedServerConfig>;

  public oauthServers: Set<string> = new Set();
  public serverInstructions: Record<string, string> = {};
  public toolFunctions: t.LCAvailableTools = {};
  public mcpPrompt: t.LCAvailableMCPPrompts = {};
  public appServerConfigs: t.MCPServers = {};

  constructor(configs: t.MCPServers) {
    this.rawConfigs = configs;
    this.parsedConfigs = mapValues(configs, (con) => processMCPEnv({ options: con }));
    this.connections = new ConnectionsRepository(configs);
    this.initTimeoutMs = getMCPInitTimeout();
  }

  /** Initializes all startup-enabled servers by gathering their metadata asynchronously */
  public async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const serverNames = Object.keys(this.parsedConfigs);

    await Promise.allSettled(
      serverNames.map((serverName) => this.initializeServerWithTimeout(serverName)),
    );

    // Ensure all connections are disconnected after initialization
    await Promise.allSettled(this.connections.disconnectAll());
  }

  /** Wraps server initialization with a timeout to prevent hanging */
  private async initializeServerWithTimeout(serverName: string): Promise<void> {
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      await Promise.race([
        this.initializeServer(serverName),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('Server initialization timed out'));
          }, this.initTimeoutMs);
        }),
      ]);
    } catch (error) {
      logger.warn(`${this.prefix(serverName)} Server initialization failed:`, error);
      throw error;
    } finally {
      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
    }
  }

  /** Initializes a single server with all its metadata and adds it to appropriate collections */
  private async initializeServer(serverName: string): Promise<void> {
    const start = Date.now();

    const config = this.parsedConfigs[serverName];

    // 1. Detect OAuth requirements if not already specified
    let serverCapabilityPrompts: t.LCAvailableMCPPrompts | null = null;
    try {
      await this.fetchOAuthRequirement(serverName);

      if (config.startup !== false && !config.requiresOAuth) {
        const results = await Promise.allSettled([
          this.fetchServerInstructions(serverName).catch((error) =>
            logger.warn(`${this.prefix(serverName)} Failed to fetch server instructions:`, error),
          ),
          this.fetchServerCapabilities(serverName).catch((error) => {
            logger.warn(`${this.prefix(serverName)} Failed to fetch server capabilities:`, error);
            return null;
          }),
        ]);
        
        // Extract prompts from fetchServerCapabilities result
        const capabilitiesResult = results[1];
        if (capabilitiesResult.status === 'fulfilled') {
          serverCapabilityPrompts = capabilitiesResult.value;
        }
      }
    } catch (error) {
      logger.warn(`${this.prefix(serverName)} Failed to initialize server:`, error);
    }

    // 2. Fetch tool functions and prompts for this server if a connection was established
    const getToolFunctions = async (): Promise<t.LCAvailableTools | null> => {
      try {
        const loadedConns = await this.connections.getLoaded();
        const conn = loadedConns.get(serverName);
        if (conn == null) {
          return null;
        }
        return this.getToolFunctions(serverName, conn);
      } catch (error) {
        logger.warn(`${this.prefix(serverName)} Error fetching tool functions:`, error);
        return null;
      }
    };
    const toolFunctions = await getToolFunctions();

    // 2.1. Use prompts collected from fetchServerCapabilities
    const mcpPrompts = serverCapabilityPrompts;
    console.log(`[DEBUG][${serverName}] Using prompts from server capabilities:`, mcpPrompts);

    // 3. Disconnect this server's connection if it was established (fire-and-forget)
    void this.connections.disconnect(serverName);

    // 4. Side effects
    // 4.1 Add to OAuth servers if needed
    if (config.requiresOAuth) {
      this.oauthServers.add(serverName);
    }
    // 4.2 Add server instructions if available
    if (config.serverInstructions != null) {
      this.serverInstructions[serverName] = config.serverInstructions as string;
    }
    // 4.3 Add to app server configs if eligible (startup enabled, non-OAuth servers)
    if (config.startup !== false && config.requiresOAuth === false) {
      this.appServerConfigs[serverName] = this.rawConfigs[serverName];
    }
    // 4.4 Add tool functions if available
    if (toolFunctions != null) {
      Object.assign(this.toolFunctions, toolFunctions);
    }
    // 4.5 Add MCP prompts if available
    if (mcpPrompts != null) {
      console.log(`[DEBUG][${serverName}] Adding prompts to registry:`, Object.keys(mcpPrompts));
      Object.assign(this.mcpPrompt, mcpPrompts);
      console.log(`[DEBUG][${serverName}] Registry now has prompts:`, Object.keys(this.mcpPrompt));
    } else {
      console.log(`[DEBUG][${serverName}] No prompts to add (mcpPrompts is null)`);
    }

    const duration = Date.now() - start;
    this.logUpdatedConfig(serverName, duration);
  }

  /** Converts server tools to LibreChat-compatible tool functions format */
  public async getToolFunctions(
    serverName: string,
    conn: MCPConnection,
  ): Promise<t.LCAvailableTools> {
    const { tools }: t.MCPToolListResponse = await conn.client.listTools();

    const toolFunctions: t.LCAvailableTools = {};
    tools.forEach((tool) => {
      const name = `${tool.name}${Constants.mcp_delimiter}${serverName}`;
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

  public async getMCPPrompt(
    serverName: string,
    conn: MCPConnection,
  ): Promise<t.LCAvailableMCPPrompts> {
    const { prompts }: t.MCPPromptListResponse = await conn.client.listPrompts();
    console.log('Constants.mcp_delimiter', Constants.mcp_delimiter);
    const mcpPromptList: t.LCAvailableMCPPrompts = {};
    prompts.forEach((prompt) => {
      const name = `${prompt.name}${Constants.mcp_delimiter}${serverName}`;
      mcpPromptList[name] = {
        name: prompt.name,
        description: prompt.description || '',
        arguments: Array.isArray(prompt.arguments) ? prompt.arguments : [],
        mcpServerName: serverName,
        promptKey: name,
      };
    });
    console.log('mcpPromptList', mcpPromptList);
    return mcpPromptList;
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

    // If it's a string that's not "true", it's a custom instruction
    if (typeof config.serverInstructions === 'string' && !isEnabled(config.serverInstructions)) {
      return;
    }

    // Fetch from server if true (boolean) or "true" (string)
    const conn = await this.connections.get(serverName);
    config.serverInstructions = conn.client.getInstructions();
    if (!config.serverInstructions) {
      logger.warn(`${this.prefix(serverName)} No server instructions available`);
    }
  }

  /** Fetches server capabilities and available tools list, returns prompts for collection */
  private async fetchServerCapabilities(
    serverName: string,
  ): Promise<t.LCAvailableMCPPrompts | null> {
    const config = this.parsedConfigs[serverName];
    const conn = await this.connections.get(serverName);
    const capabilities = conn.client.getServerCapabilities();
    if (!capabilities) return null;
    config.capabilities = JSON.stringify(capabilities);
    
    // Fetch tools if supported
    if (capabilities.tools) {
      const tools = await conn.client.listTools();
      config.tools = tools.tools.map((tool) => tool.name).join(', ');
    }
    
    // Fetch and return prompts if supported
    if (capabilities.prompts) {
      const prompts = await conn.client.listPrompts();
      config.mcp_prompts = prompts.prompts.map((prompt) => prompt.name).join(', ');
      console.log(
        `[DEBUG][${serverName}] Found ${prompts.prompts.length} prompts, converting to LibreChat format`,
      );
      console.log(`[DEBUG][${serverName}] EXECUTING NEW PROMPT COLLECTION LOGIC`);
      const mcpPrompts = this.getMCPPrompt(serverName, conn);
      console.log(`[DEBUG][${serverName}] Created MCP prompts:`, mcpPrompts);
      return mcpPrompts;
    }
    
    return null;
  }

  // Logs server configuration summary after initialization
  private logUpdatedConfig(serverName: string, initDuration: number): void {
    const prefix = this.prefix(serverName);
    const config = this.parsedConfigs[serverName];
    logger.info(`${prefix} -------------------------------------------------┐`);
    logger.info(`${prefix} URL: ${config.url ? sanitizeUrlForLogging(config.url) : 'N/A'}`);
    logger.info(`${prefix} OAuth Required: ${config.requiresOAuth}`);
    logger.info(`${prefix} Capabilities: ${config.capabilities}`);
    logger.info(`${prefix} Tools: ${config.tools}`);
    logger.info(`${prefix} Prompts: ${config.mcp_prompts}`);
    logger.info(`${prefix} Server Instructions: ${config.serverInstructions}`);
    logger.info(`${prefix} Initialized in: ${initDuration}ms`);
    logger.info(`${prefix} -------------------------------------------------┘`);
  }

  // Returns formatted log prefix for server messages
  private prefix(serverName: string): string {
    return `[MCP][${serverName}]`;
  }
}
