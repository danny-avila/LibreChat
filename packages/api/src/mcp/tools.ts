import { logger } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';
import type { JsonSchemaType } from '@librechat/agents';
import type { LCAvailableTools, LCFunctionTool, MCPResource, ParsedServerConfig } from './types';
import { requiresEphemeralUserConnection } from './utils';

export const MCPResourceListToolName = 'resources/list';
export const MCPResourceReadToolName = 'resources/read';

export interface MCPToolInput {
  name: string;
  description?: string;
  inputSchema?: JsonSchemaType;
}

export interface MCPToolCacheDeps {
  getCachedTools: (options?: {
    userId?: string;
    serverName?: string;
  }) => Promise<LCAvailableTools | null>;
  setCachedTools: (
    tools: LCAvailableTools,
    options?: { userId?: string; serverName?: string },
  ) => Promise<boolean>;
  getServerConfig: (serverName: string, userId?: string) => Promise<ParsedServerConfig | undefined>;
}

export interface MCPToolCacheService {
  updateMCPServerTools: (params: {
    userId: string;
    serverName: string;
    tools: MCPToolInput[] | null;
    resources?: MCPResource[] | null;
    serverConfig?: ParsedServerConfig;
  }) => Promise<LCAvailableTools>;
  mergeAppTools: (appTools: LCAvailableTools) => Promise<void>;
  cacheMCPServerTools: (params: {
    userId: string;
    serverName: string;
    serverTools: LCAvailableTools;
    serverConfig?: ParsedServerConfig;
  }) => Promise<void>;
  getMCPServerTools: (
    userId: string,
    serverName: string,
    serverConfig?: ParsedServerConfig,
  ) => Promise<LCAvailableTools | null>;
}

export function createMCPToolCacheService(deps: MCPToolCacheDeps): MCPToolCacheService {
  const { getCachedTools, setCachedTools, getServerConfig } = deps;

  function createToolEntry(
    name: string,
    description: string,
    parameters: JsonSchemaType,
  ): LCFunctionTool {
    return {
      type: 'function',
      ['function']: {
        name,
        description,
        parameters,
      },
    };
  }

  function getResourceToolDefinitions(serverName: string, resources?: MCPResource[] | null) {
    if (!resources?.length) {
      return {};
    }

    const listName = `${MCPResourceListToolName}${Constants.mcp_delimiter}${serverName}`;
    const readName = `${MCPResourceReadToolName}${Constants.mcp_delimiter}${serverName}`;

    return {
      [listName]: createToolEntry(
        listName,
        `List available MCP resources from server "${serverName}".`,
        { type: 'object', properties: {}, required: [] } as JsonSchemaType,
      ),
      [readName]: createToolEntry(
        readName,
        `Read an MCP resource from server "${serverName}" by URI.`,
        {
          type: 'object',
          properties: {
            uri: {
              type: 'string',
              description: 'The URI of the MCP resource to read.',
            },
          },
          required: ['uri'],
        } as JsonSchemaType,
      ),
    } satisfies LCAvailableTools;
  }

  function buildServerTools(
    serverName: string,
    tools: MCPToolInput[] | null,
    resources?: MCPResource[] | null,
  ): LCAvailableTools {
    const serverTools: LCAvailableTools = {};
    const mcpDelimiter = Constants.mcp_delimiter;

    for (const tool of tools ?? []) {
      const name = `${tool.name}${mcpDelimiter}${serverName}`;
      serverTools[name] = createToolEntry(
        name,
        tool.description ?? '',
        tool.inputSchema ?? ({ type: 'object', properties: {} } as JsonSchemaType),
      );
    }

    return { ...serverTools, ...getResourceToolDefinitions(serverName, resources) };
  }

  /**
   * Request-scoped servers resolve runtime user/request placeholders per
   * connection, so their definitions must never enter the persistent tool
   * cache. Fails open: an unresolvable config is treated as cacheable,
   * preserving pre-gating behavior for servers the registry cannot see.
   * The resolver sees only base registry configs — callers holding merged
   * Config-overlay configs must pass them. All writers do, so an entry that
   * predates gating or an overlay change survives at most one cache TTL.
   */
  async function isRequestScoped(
    userId: string,
    serverName: string,
    serverConfig?: ParsedServerConfig,
  ): Promise<boolean> {
    try {
      const config = serverConfig ?? (await getServerConfig(serverName, userId));
      return config ? requiresEphemeralUserConnection(config) : false;
    } catch (error) {
      logger.debug(
        `[MCP Cache] Could not resolve config for ${serverName} (user: ${userId}), treating as cacheable:`,
        error,
      );
      return false;
    }
  }

  async function updateMCPServerTools(params: {
    userId: string;
    serverName: string;
    tools: MCPToolInput[] | null;
    resources?: MCPResource[] | null;
    serverConfig?: ParsedServerConfig;
  }): Promise<LCAvailableTools> {
    const { userId, serverName, tools, resources, serverConfig } = params;
    try {
      const serverTools = buildServerTools(serverName, tools, resources);
      const count = Object.keys(serverTools).length;

      if (count === 0) {
        logger.debug(`[MCP Cache] No tools to update for server ${serverName} (user: ${userId})`);
        return serverTools;
      }

      if (await isRequestScoped(userId, serverName, serverConfig)) {
        logger.debug(
          `[MCP Cache] Built ${count} tools for request-scoped server ${serverName} (user: ${userId}) without caching`,
        );
        return serverTools;
      }

      await setCachedTools(serverTools, { userId, serverName });
      logger.debug(`[MCP Cache] Updated ${count} tools for server ${serverName} (user: ${userId})`);
      return serverTools;
    } catch (error) {
      logger.error(
        `[MCP Cache] Failed to update tools for ${serverName} (user: ${userId}):`,
        error,
      );
      throw error;
    }
  }

  async function mergeAppTools(appTools: LCAvailableTools): Promise<void> {
    try {
      const count = Object.keys(appTools).length;
      if (!count) {
        return;
      }
      const cachedTools = (await getCachedTools()) ?? {};
      const mergedTools: LCAvailableTools = { ...cachedTools, ...appTools };
      await setCachedTools(mergedTools);
      logger.debug(`Merged ${count} app-level tools`);
    } catch (error) {
      logger.error('Failed to merge app-level tools:', error);
      throw error;
    }
  }

  async function cacheMCPServerTools(params: {
    userId: string;
    serverName: string;
    serverTools: LCAvailableTools;
    serverConfig?: ParsedServerConfig;
  }): Promise<void> {
    const { userId, serverName, serverTools, serverConfig } = params;
    try {
      const count = Object.keys(serverTools).length;
      if (!count) {
        return;
      }
      if (await isRequestScoped(userId, serverName, serverConfig)) {
        logger.debug(
          `[MCP Cache] Skipped caching ${count} tools for request-scoped server ${serverName} (user: ${userId})`,
        );
        return;
      }
      await setCachedTools(serverTools, { userId, serverName });
      logger.debug(`Cached ${count} MCP server tools for ${serverName} (user: ${userId})`);
    } catch (error) {
      logger.error(`Failed to cache MCP server tools for ${serverName} (user: ${userId}):`, error);
      throw error;
    }
  }

  async function getMCPServerTools(
    userId: string,
    serverName: string,
    serverConfig?: ParsedServerConfig,
  ): Promise<LCAvailableTools | null> {
    if (await isRequestScoped(userId, serverName, serverConfig)) {
      return null;
    }
    try {
      return (await getCachedTools({ userId, serverName })) ?? null;
    } catch (error) {
      logger.error(`[getMCPServerTools] Error fetching cached tools for ${serverName}:`, error);
      return null;
    }
  }

  return { updateMCPServerTools, mergeAppTools, cacheMCPServerTools, getMCPServerTools };
}

export function createMCPResourceTools(
  serverName: string,
  resources?: MCPResource[] | null,
): LCAvailableTools {
  if (!resources?.length) {
    return {};
  }

  const listName = `${MCPResourceListToolName}${Constants.mcp_delimiter}${serverName}`;
  const readName = `${MCPResourceReadToolName}${Constants.mcp_delimiter}${serverName}`;

  return {
    [listName]: {
      type: 'function',
      ['function']: {
        name: listName,
        description: `List available MCP resources from server "${serverName}".`,
        parameters: { type: 'object', properties: {}, required: [] } as JsonSchemaType,
      },
    },
    [readName]: {
      type: 'function',
      ['function']: {
        name: readName,
        description: `Read an MCP resource from server "${serverName}" by URI.`,
        parameters: {
          type: 'object',
          properties: {
            uri: {
              type: 'string',
              description: 'The URI of the MCP resource to read.',
            },
          },
          required: ['uri'],
        } as JsonSchemaType,
      },
    },
  };
}
