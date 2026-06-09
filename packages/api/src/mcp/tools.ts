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
export const MAX_OPENAI_TOOL_NAME_LENGTH = 64;

/**
 * Minimal logger surface used by {@link composeMCPToolName}. Allows callers to
 * inject the shared `logger` from `@librechat/data-schemas` or any compatible
 * stub (e.g. in tests) without coupling this helper to a specific instance.
 */
export interface MCPToolNameLogger {
  warn: (message: string) => void;
}

/**
 * Composes an MCP tool function name (`${toolName}${mcp_delimiter}${serverName}`)
 * and emits an actionable warning when the result exceeds the OpenAI-compatible
 * 64-character limit. The composed name is returned in all cases — the warning
 * is diagnostic only and does not alter behavior — so existing call sites can
 * adopt the helper without changing their downstream logic.
 *
 * @param toolName - Raw MCP tool name as reported by the server.
 * @param serverName - LibreChat-side name configured for the MCP server.
 * @param options.logger - Optional logger; falls back to the shared logger.
 * @param options.context - Short tag prefixed onto the warning (e.g. "MCP Cache",
 *   "MCP Inspector") so operators can trace which path materialized the name.
 */
export function composeMCPToolName(
  toolName: string,
  serverName: string,
  options: { logger?: MCPToolNameLogger; context?: string } = {},
): string {
  const delimiter = Constants.mcp_delimiter;
  const name = `${toolName}${delimiter}${serverName}`;
  if (name.length > MAX_OPENAI_TOOL_NAME_LENGTH) {
    const log = options.logger ?? logger;
    const tag = options.context ?? 'MCP';
    log.warn(
      `[${tag}] Tool name "${name}" (${name.length} chars) exceeds the ` +
        `${MAX_OPENAI_TOOL_NAME_LENGTH}-char limit enforced by OpenAI-compatible APIs ` +
        `(server: "${serverName}", tool: "${toolName}", delimiter: "${delimiter}"). ` +
        `Calls including this tool will be rejected with HTTP 400. ` +
        `Shorten the MCP server name or the tool name to fit within ` +
        `${MAX_OPENAI_TOOL_NAME_LENGTH - delimiter.length} characters combined.`,
    );
  }
  return name;
}

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

export function createMCPToolCacheService(deps: MCPToolCacheDeps): {
  updateMCPServerTools: (params: {
    userId: string;
    serverName: string;
    tools: MCPToolInput[] | null;
  }) => Promise<LCAvailableTools>;
  mergeAppTools: (appTools: LCAvailableTools) => Promise<void>;
  cacheMCPServerTools: (params: {
    userId: string;
    serverName: string;
    serverTools: LCAvailableTools;
  }) => Promise<void>;
} {
  const { getCachedTools, setCachedTools } = deps;

  async function updateMCPServerTools(params: {
    userId: string;
    serverName: string;
    tools: MCPToolInput[] | null;
  }): Promise<LCAvailableTools> {
    const { userId, serverName, tools } = params;
    try {
      const serverTools: LCAvailableTools = {};

      if (tools == null || tools.length === 0) {
        logger.debug(`[MCP Cache] No tools to update for server ${serverName} (user: ${userId})`);
        return serverTools;
      }

      for (const tool of tools) {
        const name = composeMCPToolName(tool.name, serverName, { context: 'MCP Cache' });
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
