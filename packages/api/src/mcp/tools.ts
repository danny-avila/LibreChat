import { logger } from '@librechat/data-schemas';
import { Constants, buildServerNameAliases, normalizeServerName } from 'librechat-data-provider';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { JsonSchemaType } from '@librechat/agents';
import type { LCAvailableTools, LCFunctionTool, ParsedServerConfig } from './types';
import { canUseAppConnection, requiresEphemeralUserConnection } from './utils';
import { normalizeJsonSchema, resolveJsonSchemaRefs } from './zod';

export type MCPToolInput = Pick<Tool, 'name' | 'description'> & Partial<Pick<Tool, 'inputSchema'>>;

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
  getAllServerConfigs?: () => Promise<Record<string, ParsedServerConfig>>;
  getCachedAppServerSnapshots?: () => Promise<string[] | null>;
  setCachedAppServerSnapshots?: (serverNames: string[]) => Promise<boolean>;
  runWithGlobalCacheLock?: <T>(operation: () => Promise<T>) => Promise<T>;
}

export interface MCPToolCacheService {
  updateMCPServerTools: (params: {
    userId?: string;
    serverName: string;
    tools: MCPToolInput[] | null;
    serverConfig?: ParsedServerConfig;
  }) => Promise<LCAvailableTools>;
  mergeAppTools: (appTools: LCAvailableTools) => Promise<void>;
  replaceAppServerTools: (params: {
    serverName: string;
    serverTools: LCAvailableTools;
  }) => Promise<void>;
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

interface AppServerBoundary {
  serverName: string;
  suffix: string;
}

export function createMCPToolCacheService(deps: MCPToolCacheDeps): MCPToolCacheService {
  const {
    getCachedTools,
    setCachedTools,
    getServerConfig,
    getAllServerConfigs,
    getCachedAppServerSnapshots,
    setCachedAppServerSnapshots,
    runWithGlobalCacheLock,
  } = deps;
  let globalCacheQueue: Promise<void> = Promise.resolve();

  async function writeCachedTools(
    tools: LCAvailableTools,
    options?: { userId?: string; serverName?: string },
  ): Promise<void> {
    const success = options ? await setCachedTools(tools, options) : await setCachedTools(tools);
    if (success === false) {
      throw new Error('Tool cache rejected the write');
    }
  }

  function withGlobalCacheLock<T>(operation: () => Promise<T>): Promise<T> {
    const lockedOperation = () =>
      runWithGlobalCacheLock ? runWithGlobalCacheLock(operation) : operation();
    const result = globalCacheQueue.then(lockedOperation, lockedOperation);
    globalCacheQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function isAppSharedConfig(
    serverName: string,
    config: ParsedServerConfig | undefined,
  ): Promise<boolean> {
    if (!config || !canUseAppConnection(config)) {
      return false;
    }
    if (!getAllServerConfigs) {
      return true;
    }
    try {
      const appConfigs = await getAllServerConfigs();
      return appConfigs[serverName] != null;
    } catch (error) {
      logger.debug(
        `[MCP Cache] Could not verify app ownership for ${serverName}; using user scope:`,
        error,
      );
      return false;
    }
  }

  async function writeCachedAppServerSnapshots(serverNames: string[]): Promise<void> {
    if (!setCachedAppServerSnapshots) {
      return;
    }
    if ((await setCachedAppServerSnapshots(serverNames)) === false) {
      throw new Error('App tool snapshot cache rejected the write');
    }
  }

  async function getStartupAppServerSnapshots(): Promise<string[] | null> {
    if (!getAllServerConfigs || !setCachedAppServerSnapshots) {
      return null;
    }
    const configs = await getAllServerConfigs();
    return Object.entries(configs)
      .filter(([, config]) => canUseAppConnection(config) && config.toolFunctions != null)
      .map(([serverName]) => serverName);
  }

  async function resolveCacheConfig(
    userId: string | undefined,
    serverName: string,
    serverConfig?: ParsedServerConfig,
  ): Promise<ParsedServerConfig | undefined> {
    if (serverConfig) {
      return serverConfig;
    }
    try {
      return await getServerConfig(serverName, userId);
    } catch (error) {
      logger.debug(
        `[MCP Cache] Could not resolve config for ${serverName} (user: ${userId}), preserving legacy cache scope:`,
        error,
      );
      return undefined;
    }
  }

  async function getAppServerBoundaries(serverName: string): Promise<AppServerBoundary[]> {
    const names = getAllServerConfigs ? Object.keys(await getAllServerConfigs()) : [];
    if (!names.includes(serverName)) {
      names.push(serverName);
    }

    const boundaryOwners = new Map<string, string>();
    for (const rawName of names) {
      if (normalizeServerName(rawName) !== rawName) {
        boundaryOwners.set(`${Constants.mcp_delimiter}${rawName}`, rawName);
      }
    }
    for (const [normalizedName, rawName] of buildServerNameAliases(names)) {
      boundaryOwners.set(`${Constants.mcp_delimiter}${normalizedName}`, rawName);
    }

    return Array.from(boundaryOwners, ([suffix, rawName]) => ({
      serverName: rawName,
      suffix,
    })).sort((left, right) => right.suffix.length - left.suffix.length);
  }

  function resolveToolServerName(
    toolName: string,
    boundaries: readonly AppServerBoundary[],
  ): string | null {
    for (const boundary of boundaries) {
      if (toolName.endsWith(boundary.suffix)) {
        return boundary.serverName;
      }
    }
    return null;
  }

  function getAppServerSlice(
    tools: LCAvailableTools,
    serverName: string,
    boundaries: readonly AppServerBoundary[],
  ): LCAvailableTools {
    return Object.fromEntries(
      Object.entries(tools).filter(
        ([name]) => resolveToolServerName(name, boundaries) === serverName,
      ),
    );
  }

  async function updateMCPServerTools(params: {
    userId?: string;
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
            parameters: tool.inputSchema
              ? (normalizeJsonSchema(resolveJsonSchemaRefs(tool.inputSchema)) as JsonSchemaType)
              : ({ type: 'object', properties: {} } as JsonSchemaType),
          },
        };
        serverTools[name] = entry;
      }

      const resolvedConfig = await resolveCacheConfig(userId, serverName, serverConfig);
      if (resolvedConfig && requiresEphemeralUserConnection(resolvedConfig)) {
        logger.debug(
          `[MCP Cache] Built ${tools.length} tools for request-scoped server ${serverName} (user: ${userId}) without caching`,
        );
        return serverTools;
      }

      if (userId && !(await isAppSharedConfig(serverName, resolvedConfig))) {
        await writeCachedTools(serverTools, { userId, serverName });
      } else {
        await replaceAppServerTools({ serverName, serverTools });
      }
      logger.debug(
        `[MCP Cache] Updated ${tools.length} tools for server ${serverName}${userId ? ` (user: ${userId})` : ' (app-level)'}`,
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
      const appServerSnapshots = await getStartupAppServerSnapshots();
      await withGlobalCacheLock(async () => {
        const cachedTools = (await getCachedTools()) ?? {};
        const mergedTools: LCAvailableTools = {};
        for (const [name, tool] of Object.entries(cachedTools)) {
          if (!name.includes(Constants.mcp_delimiter)) {
            mergedTools[name] = tool;
          }
        }
        Object.assign(mergedTools, appTools);
        await writeCachedTools(mergedTools);
        if (appServerSnapshots) {
          await writeCachedAppServerSnapshots(appServerSnapshots);
        }
      });
      logger.debug(`Synchronized ${count} app-level MCP tools`);
    } catch (error) {
      logger.error('Failed to merge app-level tools:', error);
      throw error;
    }
  }

  /**
   * Swaps one server's app-level tools for the set it reports now.
   *
   * Unlike mergeAppTools this also drops what disappeared: a server that removes a tool at runtime
   * would otherwise keep it advertised forever, since merging can only ever add. Only entries
   * belonging to `serverName` are touched, so other servers' tools survive untouched.
   */
  async function replaceAppServerTools(params: {
    serverName: string;
    serverTools: LCAvailableTools;
  }): Promise<void> {
    const { serverName, serverTools } = params;
    try {
      const boundaries = await getAppServerBoundaries(serverName);
      for (const name of Object.keys(serverTools)) {
        const owner = resolveToolServerName(name, boundaries);
        if (owner && owner !== serverName) {
          throw new Error(`Tool ${name} belongs to app server ${owner}, not ${serverName}`);
        }
      }
      await withGlobalCacheLock(async () => {
        const appServerSnapshots =
          getCachedAppServerSnapshots && setCachedAppServerSnapshots
            ? new Set((await getCachedAppServerSnapshots()) ?? [])
            : null;
        const cachedTools = (await getCachedTools()) ?? {};
        const kept: LCAvailableTools = {};
        for (const [name, tool] of Object.entries(cachedTools)) {
          if (resolveToolServerName(name, boundaries) !== serverName) {
            kept[name] = tool;
          }
        }
        await writeCachedTools({ ...kept, ...serverTools });
        if (appServerSnapshots) {
          appServerSnapshots.add(serverName);
          await writeCachedAppServerSnapshots(Array.from(appServerSnapshots));
        }
      });
      logger.debug(
        `[MCP Cache] Replaced app-level tools for ${serverName} with ${Object.keys(serverTools).length} tool(s)`,
      );
    } catch (error) {
      logger.error(`[MCP Cache] Failed to replace app-level tools for ${serverName}:`, error);
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
      const resolvedConfig = await resolveCacheConfig(userId, serverName, serverConfig);
      if (resolvedConfig && requiresEphemeralUserConnection(resolvedConfig)) {
        logger.debug(
          `[MCP Cache] Skipped caching ${count} tools for request-scoped server ${serverName} (user: ${userId})`,
        );
        return;
      }
      if (await isAppSharedConfig(serverName, resolvedConfig)) {
        await replaceAppServerTools({ serverName, serverTools });
        logger.debug(`Refreshed app-level MCP tools for ${serverName}`);
        return;
      }
      await writeCachedTools(serverTools, { userId, serverName });
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
    const resolvedConfig = await resolveCacheConfig(userId, serverName, serverConfig);
    if (resolvedConfig && requiresEphemeralUserConnection(resolvedConfig)) {
      return null;
    }
    try {
      if (await isAppSharedConfig(serverName, resolvedConfig)) {
        const globalTools = await getCachedTools();
        if (globalTools == null) {
          return null;
        }
        const boundaries = await getAppServerBoundaries(serverName);
        const serverTools = getAppServerSlice(globalTools, serverName, boundaries);
        if (Object.keys(serverTools).length === 0) {
          const appServerSnapshots = await getCachedAppServerSnapshots?.();
          if (appServerSnapshots?.includes(serverName)) {
            return {};
          }
          return null;
        }
        return normalizeCachedToolKeys(serverTools, serverName);
      }
      const cached = (await getCachedTools({ userId, serverName })) ?? null;
      if (!cached) {
        return null;
      }
      return normalizeCachedToolKeys(cached, serverName);
    } catch (error) {
      logger.error(`[getMCPServerTools] Error fetching cached tools for ${serverName}:`, error);
      return null;
    }
  }

  return {
    updateMCPServerTools,
    mergeAppTools,
    replaceAppServerTools,
    cacheMCPServerTools,
    getMCPServerTools,
  };
}
