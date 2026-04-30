import { logger } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';
import type { JsonSchemaType } from '@librechat/agents';
import type { LCAvailableTools, LCFunctionTool } from './types';

/**
 * Maximum allowed length for tool function names accepted by OpenAI-compatible
 * Chat Completions / Responses APIs. Tool calls whose names exceed this limit
 * are rejected with HTTP 400 ("string too long. Expected ... maximum length 64").
 * MCP tool names are constructed as `${toolName}${mcp_delimiter}${serverName}`,
 * so callers must keep the combined length within this bound.
 *
 * Refs: https://platform.openai.com/docs/api-reference/chat/create
 *       https://github.com/danny-avila/LibreChat/issues/7435
 */
const MAX_OPENAI_TOOL_NAME_LENGTH = 64;

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
}

export function createMCPToolCacheService(deps: MCPToolCacheDeps) {
  const { getCachedTools, setCachedTools } = deps;

  async function updateMCPServerTools(params: {
    userId: string;
    serverName: string;
    tools: MCPToolInput[] | null;
  }): Promise<LCAvailableTools> {
    const { userId, serverName, tools } = params;
    try {
      const serverTools: LCAvailableTools = {};
      const mcpDelimiter = Constants.mcp_delimiter;

      if (tools == null || tools.length === 0) {
        logger.debug(`[MCP Cache] No tools to update for server ${serverName} (user: ${userId})`);
        return serverTools;
      }

      for (const tool of tools) {
        const name = `${tool.name}${mcpDelimiter}${serverName}`;
        if (name.length > MAX_OPENAI_TOOL_NAME_LENGTH) {
          logger.warn(
            `[MCP Cache] Tool name "${name}" (${name.length} chars) exceeds the ` +
              `${MAX_OPENAI_TOOL_NAME_LENGTH}-char limit enforced by OpenAI-compatible APIs ` +
              `(server: "${serverName}", tool: "${tool.name}", delimiter: "${mcpDelimiter}"). ` +
              `Calls including this tool will be rejected with HTTP 400. ` +
              `Shorten the MCP server name or the tool name to fit within ` +
              `${MAX_OPENAI_TOOL_NAME_LENGTH - mcpDelimiter.length} characters combined.`,
          );
        }
        const entry: LCFunctionTool = {
          type: 'function',
          ['function']: {
            name,
            description: tool.description ?? '',
            parameters: tool.inputSchema ?? ({ type: 'object', properties: {} } as JsonSchemaType),
          },
        };
        serverTools[name] = entry;
      }

      await setCachedTools(serverTools, { userId, serverName });
      logger.debug(
        `[MCP Cache] Updated ${tools.length} tools for server ${serverName} (user: ${userId})`,
      );
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
  }): Promise<void> {
    const { userId, serverName, serverTools } = params;
    try {
      const count = Object.keys(serverTools).length;
      if (!count) {
        return;
      }
      await setCachedTools(serverTools, { userId, serverName });
      logger.debug(`Cached ${count} MCP server tools for ${serverName} (user: ${userId})`);
    } catch (error) {
      logger.error(`Failed to cache MCP server tools for ${serverName} (user: ${userId}):`, error);
      throw error;
    }
  }

  return { updateMCPServerTools, mergeAppTools, cacheMCPServerTools };
}
