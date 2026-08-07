import { logger } from '@librechat/data-schemas';
import { Constants, normalizeServerName } from 'librechat-data-provider';
import type { JsonSchemaType } from '@librechat/agents';
import type { LCAvailableTools, LCFunctionTool, ParsedServerConfig } from './types';
import { requiresEphemeralUserConnection } from './utils';

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
    serverConfig?: ParsedServerConfig;
  }): Promise<LCAvailableTools> {
    const { userId, serverName, tools, serverConfig } = params;
    try {
      const serverTools: LCAvailableTools = {};
      const mcpDelimiter = Constants.mcp_delimiter;

      if (tools == null) {
        logger.debug(`[MCP Cache] No tools to update for server ${serverName} (user: ${userId})`);
        return serverTools;
      }

      if (tools.length === 0) {
        if (!(await isRequestScoped(userId, serverName, serverConfig))) {
          await setCachedTools(serverTools, { userId, serverName });
          logger.debug(
            `[MCP Cache] Cleared stale tools for server ${serverName} (user: ${userId})`,
          );
        }
        return serverTools;
      }

      /** Cache keys are MODEL-FACING: they become builder tool ids, agent.tools
       *  entries, tool_options keys, and definition names, and must equal the
       *  runtime instance name (`createToolInstance` in MCP.js), which embeds
       *  `normalizeServerName(serverName)`. The cache STORE itself stays keyed
       *  by the raw config name. */
      const keyServerName = normalizeServerName(serverName);
      for (const tool of tools) {
        const name = `${tool.name}${mcpDelimiter}${keyServerName}`;
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

      if (await isRequestScoped(userId, serverName, serverConfig)) {
        logger.debug(
          `[MCP Cache] Built ${tools.length} tools for request-scoped server ${serverName} (user: ${userId}) without caching`,
        );
        return serverTools;
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

  /**
   * Heals cache entries written before keys embedded the normalized server
   * name. The definitions-only loader treats the returned map as
   * authoritative — a per-key miss does NOT trigger a reconnect the way the
   * instance path does — so a stale raw-keyed entry would make the server's
   * tools vanish for up to the cache TTL after rollout. Rewriting at read
   * time covers every consumer without a coordinated invalidation; safe
   * server names (the common case) return the map untouched.
   */
  function normalizeCachedToolKeys(
    tools: LCAvailableTools | null,
    serverName: string,
  ): LCAvailableTools | null {
    if (!tools) {
      return tools;
    }
    const normalized = normalizeServerName(serverName);
    if (normalized === serverName) {
      return tools;
    }
    const legacySuffix = `${Constants.mcp_delimiter}${serverName}`;
    let changed = false;
    const next: LCAvailableTools = {};
    for (const [key, entry] of Object.entries(tools)) {
      if (!key.endsWith(legacySuffix)) {
        next[key] = entry;
        continue;
      }
      const rebuiltKey = `${key.slice(0, key.length - serverName.length)}${normalized}`;
      next[rebuiltKey] = {
        ...entry,
        ['function']: { ...entry['function'], name: rebuiltKey },
      };
      changed = true;
    }
    return changed ? next : tools;
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
      const cached = (await getCachedTools({ userId, serverName })) ?? null;
      if (!cached || Object.keys(cached).length === 0) {
        return null;
      }
      return normalizeCachedToolKeys(cached, serverName);
    } catch (error) {
      logger.error(`[getMCPServerTools] Error fetching cached tools for ${serverName}:`, error);
      return null;
    }
  }

  return { updateMCPServerTools, mergeAppTools, cacheMCPServerTools, getMCPServerTools };
}
