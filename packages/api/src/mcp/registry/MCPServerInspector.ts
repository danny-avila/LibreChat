import { Constants } from 'librechat-data-provider';
import type { JsonSchemaType } from '@librechat/data-schemas';
import type { MCPConnection } from '~/mcp/connection';
import type * as t from '~/mcp/types';
import { isMCPDomainAllowed, extractMCPServerDomain } from '~/auth/domain';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { MCPDomainNotAllowedError } from '~/mcp/errors';
import { detectOAuthRequirement } from '~/mcp/oauth';
import { isEnabled } from '~/utils';

/**
 * Inspects MCP servers to discover their metadata, capabilities, and tools.
 * Connects to servers and populates configuration with OAuth requirements,
 * server instructions, capabilities, and available tools.
 */
export class MCPServerInspector {
  private constructor(
    private readonly serverName: string,
    private readonly config: t.ParsedServerConfig,
    private connection: MCPConnection | undefined,
  ) {}

  /**
   * Inspects a server and returns an enriched configuration with metadata.
   * Detects OAuth requirements and fetches server capabilities.
   * @param serverName - The name of the server (used for tool function naming)
   * @param rawConfig - The raw server configuration
   * @param connection - The MCP connection
   * @param allowedDomains - Optional list of allowed domains for remote transports
   * @returns A fully processed and enriched configuration with server metadata
   */
  public static async inspect(
    serverName: string,
    rawConfig: t.MCPOptions,
    connection?: MCPConnection,
    allowedDomains?: string[] | null,
  ): Promise<t.ParsedServerConfig> {
    // Validate domain against allowlist BEFORE attempting connection
    const isDomainAllowed = await isMCPDomainAllowed(rawConfig, allowedDomains);
    if (!isDomainAllowed) {
      const domain = extractMCPServerDomain(rawConfig);
      throw new MCPDomainNotAllowedError(domain ?? 'unknown');
    }

    const start = Date.now();
    const inspector = new MCPServerInspector(serverName, rawConfig, connection);
    await inspector.inspectServer();
    inspector.config.initDuration = Date.now() - start;
    return inspector.config;
  }

  private async inspectServer(): Promise<void> {
    await this.detectOAuth();

    if (this.config.startup !== false && !this.config.requiresOAuth) {
      let tempConnection = false;
      if (!this.connection) {
        tempConnection = true;
        this.connection = await MCPConnectionFactory.create({
          serverName: this.serverName,
          serverConfig: this.config,
        });
      }

      await Promise.allSettled([
        this.fetchServerInstructions(),
        this.fetchServerCapabilities(),
        this.fetchToolFunctions(),
      ]);

      if (tempConnection) await this.connection.disconnect();
    }
  }

  private async detectOAuth(): Promise<void> {
    if (this.config.requiresOAuth != null) return;
    if (this.config.url == null || this.config.startup === false) {
      this.config.requiresOAuth = false;
      return;
    }

    // Admin-provided API key means no OAuth flow is needed
    if (this.config.apiKey?.source === 'admin') {
      this.config.requiresOAuth = false;
      return;
    }

    const result = await detectOAuthRequirement(this.config.url);
    this.config.requiresOAuth = result.requiresOAuth;
    this.config.oauthMetadata = result.metadata;
  }

  private async fetchServerInstructions(): Promise<void> {
    if (isEnabled(this.config.serverInstructions)) {
      this.config.serverInstructions = this.connection!.client.getInstructions();
    }
  }

  private async fetchServerCapabilities(): Promise<void> {
    const capabilities = this.connection!.client.getServerCapabilities();
    this.config.capabilities = JSON.stringify(capabilities);
    const tools = await this.connection!.client.listTools();
    this.config.tools = tools.tools.map((tool) => tool.name).join(', ');
  }

  private async fetchToolFunctions(): Promise<void> {
    this.config.toolFunctions = await MCPServerInspector.getToolFunctions(
      this.serverName,
      this.connection!,
    );
  }

  /**
   * Converts server tools to LibreChat-compatible tool functions format.
   * @param serverName - The name of the server
   * @param connection - The MCP connection
   * @returns Tool functions formatted for LibreChat
   */
  public static async getToolFunctions(
    serverName: string,
    connection: MCPConnection,
  ): Promise<t.LCAvailableTools> {
    const { tools }: t.MCPToolListResponse = await connection.client.listTools();

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
}
