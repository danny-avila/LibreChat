import { logger } from '@librechat/data-schemas';
import {
  Constants,
  buildServerNameAliases,
  normalizeServerName,
  stripServerNamePrefixes,
} from 'librechat-data-provider';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { JsonSchemaType } from '@librechat/agents';
import type { LCAvailableTools, LCFunctionTool, ParsedServerConfig } from './types';
import { canUseAppConnection, requiresEphemeralUserConnection } from './utils';
import { getMCPAppToolsPublicationGeneration } from './toolsChanged';
import { normalizeJsonSchema, resolveJsonSchemaRefs } from './zod';

export type MCPToolInput = Pick<Tool, 'name' | 'description'> & Partial<Pick<Tool, 'inputSchema'>>;

export interface MCPToolCacheDeps {
  getCachedTools: (options?: {
    userId?: string;
    serverName?: string;
    configGeneration?: string;
  }) => Promise<LCAvailableTools | null>;
  updateCachedGlobalTools?: (
    update: (tools: LCAvailableTools) => LCAvailableTools,
  ) => Promise<void>;
  setCachedTools: (
    tools: LCAvailableTools,
    options?: { userId?: string; serverName?: string; configGeneration?: string },
  ) => Promise<boolean>;
  setCachedToolsIfCurrent?: (
    tools: LCAvailableTools,
    options: {
      userId: string;
      serverName: string;
      configGeneration: string;
      publicationGeneration: string;
    },
  ) => Promise<boolean>;
  getCachedAppServerTools: (
    serverName: string,
    configGeneration: string,
  ) => Promise<LCAvailableTools | null>;
  setCachedAppServerTools: (
    serverName: string,
    configGeneration: string,
    tools: LCAvailableTools,
    publicationRevision?: string,
  ) => Promise<boolean>;
  getServerConfig: (serverName: string, userId?: string) => Promise<ParsedServerConfig | undefined>;
  getAllServerConfigs?: () => Promise<Record<string, ParsedServerConfig>>;
  isAppServerConfig?: (serverName: string, effectiveConfig: ParsedServerConfig) => Promise<boolean>;
}

export interface MCPToolCacheService {
  updateMCPServerTools: (params: {
    userId?: string;
    serverName: string;
    tools: MCPToolInput[] | null;
    serverConfig?: ParsedServerConfig;
    publicationGeneration?: string;
    publicationRevision?: string;
  }) => Promise<LCAvailableTools | null>;
  syncStaticTools: (staticTools: LCAvailableTools) => Promise<void>;
  mergeAppTools: (appTools: LCAvailableTools, staticTools: LCAvailableTools) => Promise<void>;
  replaceAppServerTools: (params: {
    serverName: string;
    serverTools: LCAvailableTools;
    publicationGeneration?: string;
    publicationRevision?: string;
  }) => Promise<boolean>;
  cacheMCPServerTools: (params: {
    userId: string;
    serverName: string;
    serverTools: LCAvailableTools;
    serverConfig?: ParsedServerConfig;
    publicationGeneration?: string;
    publicationRevision?: string;
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
    updateCachedGlobalTools,
    setCachedTools,
    setCachedToolsIfCurrent,
    getCachedAppServerTools,
    setCachedAppServerTools,
    getServerConfig,
    getAllServerConfigs,
    isAppServerConfig,
  } = deps;

  async function writeCachedTools(
    tools: LCAvailableTools,
    options?: { userId?: string; serverName?: string; configGeneration?: string },
  ): Promise<void> {
    const success = options ? await setCachedTools(tools, options) : await setCachedTools(tools);
    if (success === false) {
      throw new Error('Tool cache rejected the write');
    }
  }

  async function isAppSharedConfig(
    serverName: string,
    config: ParsedServerConfig | undefined,
  ): Promise<boolean> {
    if (!config || !canUseAppConnection(config)) {
      return false;
    }
    if (isAppServerConfig) {
      return isAppServerConfig(serverName, config);
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

  function buildAppServerBoundaries(serverNames: readonly string[]): AppServerBoundary[] {
    const names = Array.from(new Set(serverNames));
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

  async function getAppServerNames(): Promise<string[]> {
    if (!getAllServerConfigs) {
      return [];
    }
    return Object.entries(await getAllServerConfigs())
      .filter(([, config]) => canUseAppConnection(config))
      .map(([name]) => name);
  }

  async function getAppServerBoundaries(serverName: string): Promise<AppServerBoundary[]> {
    const names = await getAppServerNames();
    if (!names.includes(serverName)) {
      names.push(serverName);
    }
    return buildAppServerBoundaries(names);
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
    publicationGeneration?: string;
    publicationRevision?: string;
  }): Promise<LCAvailableTools | null> {
    const { userId, serverName, tools, serverConfig, publicationGeneration, publicationRevision } =
      params;
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
      const keyToolNames = stripServerNamePrefixes(
        tools.map((tool) => tool.name),
        keyServerName,
      );
      for (const tool of tools) {
        const keyToolName = keyToolNames.get(tool.name) ?? tool.name;
        const name = `${keyToolName}${mcpDelimiter}${keyServerName}`;
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
        if (keyToolName !== tool.name) {
          entry.serverToolName = tool.name;
        }
        serverTools[name] = entry;
      }

      const resolvedConfig = await resolveCacheConfig(userId, serverName, serverConfig);
      const configGeneration = resolvedConfig
        ? getMCPAppToolsPublicationGeneration(resolvedConfig)
        : undefined;
      if (resolvedConfig && requiresEphemeralUserConnection(resolvedConfig)) {
        logger.debug(
          `[MCP Cache] Built ${tools.length} tools for request-scoped server ${serverName} (user: ${userId}) without caching`,
        );
        return serverTools;
      }

      if (userId && !(await isAppSharedConfig(serverName, resolvedConfig))) {
        if (setCachedToolsIfCurrent) {
          if (!publicationGeneration || !configGeneration) {
            logger.debug(
              `[MCP Cache] Skipped unfenced or unaddressed tool publication for ${serverName} (user: ${userId})`,
            );
            return null;
          }
          const current = await setCachedToolsIfCurrent(serverTools, {
            userId,
            serverName,
            configGeneration,
            publicationGeneration,
          });
          if (!current) {
            logger.debug(
              `[MCP Cache] Ignored stale tool publication for ${serverName} (user: ${userId})`,
            );
            return null;
          }
        } else {
          await writeCachedTools(serverTools, { userId, serverName, configGeneration });
        }
      } else {
        const appConfigGeneration =
          userId == null
            ? (publicationGeneration ?? configGeneration)
            : (configGeneration ?? publicationGeneration);
        /** Only the shared catalog write needs ordering. These tools were just read from the
         * server, so the caller should still serve them; discarding a correct tool list because
         * its write could not be ordered is what makes a cache failure look to the user like a
         * server with no tools at all (#14857). A superseded write is different — another
         * replica holds something newer — and still discards below. */
        if (!publicationRevision) {
          logger.warn(
            `[MCP Cache] Serving ${tools.length} unpublished tools for ${serverName}: this snapshot reserved no revision, so every request re-fetches them`,
          );
          return serverTools;
        }
        const replaced = await replaceAppServerTools({
          serverName,
          serverTools,
          publicationGeneration: appConfigGeneration,
          publicationRevision,
        });
        if (!replaced) {
          return null;
        }
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

  async function mergeAppTools(
    appTools: LCAvailableTools,
    staticTools: LCAvailableTools,
  ): Promise<void> {
    try {
      const count = Object.keys(appTools).length;
      const appConfigs = getAllServerConfigs
        ? Object.entries(await getAllServerConfigs()).filter(([, config]) =>
            canUseAppConnection(config),
          )
        : [];
      const boundaries = buildAppServerBoundaries(appConfigs.map(([serverName]) => serverName));
      await syncStaticTools(staticTools);
      await Promise.all(
        appConfigs
          .filter(([, config]) => config.toolFunctions != null)
          .map(async ([serverName, config]) => {
            const serverTools = getAppServerSlice(appTools, serverName, boundaries);
            const configGeneration = getMCPAppToolsPublicationGeneration(config);
            await setCachedAppServerTools(serverName, configGeneration, serverTools);
          }),
      );
      logger.debug(`Synchronized ${count} app-level MCP tools`);
    } catch (error) {
      logger.error('Failed to merge app-level tools:', error);
      throw error;
    }
  }

  async function syncStaticTools(staticTools: LCAvailableTools): Promise<void> {
    await updateCachedGlobalTools?.(() => staticTools);
  }

  /**
   * Replaces one server's configuration-addressed app-level snapshot. Old and new replicas may
   * publish concurrently without overwriting each other; readers select the current config key.
   */
  async function replaceAppServerTools(params: {
    serverName: string;
    serverTools: LCAvailableTools;
    publicationGeneration?: string;
    publicationRevision?: string;
  }): Promise<boolean> {
    const { serverName, serverTools, publicationGeneration, publicationRevision } = params;
    try {
      const boundaries = await getAppServerBoundaries(serverName);
      for (const name of Object.keys(serverTools)) {
        const owner = resolveToolServerName(name, boundaries);
        if (owner && owner !== serverName) {
          throw new Error(`Tool ${name} belongs to app server ${owner}, not ${serverName}`);
        }
      }
      let configGeneration = publicationGeneration;
      if (!configGeneration) {
        const config = await resolveCacheConfig(undefined, serverName);
        configGeneration = config ? getMCPAppToolsPublicationGeneration(config) : undefined;
      }
      /** Discarding a publication is warned, not debugged: #14857 was invisible for a release
       * because the only trace of a dropped app catalog was a debug line no deployment runs.
       * A drop here means this server's tools are missing for every agent that needs them. */
      if (!configGeneration) {
        logger.warn(
          `[MCP Cache] Skipped unaddressed app-level publication for ${serverName}; its tools stay unavailable to agents`,
        );
        return false;
      }
      /** Ordering is reserved before the `tools/list` that produced these tools and travels with
       * the snapshot, so a publisher that lost it fetched at an unknown time and cannot be
       * ordered against concurrent replicas. Allocating one here instead would let a slow fetch
       * of an old catalog outrank a newer one that reserved after it started. */
      if (!publicationRevision) {
        logger.warn(
          `[MCP Cache] Skipped unordered app-level publication for ${serverName}: its snapshot carried no reserved revision, so its tools stay unavailable to agents`,
        );
        return false;
      }
      const replaced = await setCachedAppServerTools(
        serverName,
        configGeneration,
        serverTools,
        publicationRevision,
      );
      /** Expected whenever replicas publish concurrently: the winner already holds newer tools. */
      if (replaced === false) {
        logger.debug(
          `[MCP Cache] Ignored superseded app-level tools for ${serverName} at revision ${publicationRevision}`,
        );
        return false;
      }
      logger.debug(
        `[MCP Cache] Replaced app-level tools for ${serverName} with ${Object.keys(serverTools).length} tool(s)`,
      );
      return true;
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
    publicationGeneration?: string;
    publicationRevision?: string;
  }): Promise<void> {
    const {
      userId,
      serverName,
      serverTools,
      serverConfig,
      publicationGeneration,
      publicationRevision,
    } = params;
    try {
      const count = Object.keys(serverTools).length;
      const resolvedConfig = await resolveCacheConfig(userId, serverName, serverConfig);
      const configGeneration = resolvedConfig
        ? getMCPAppToolsPublicationGeneration(resolvedConfig)
        : undefined;
      if (resolvedConfig && requiresEphemeralUserConnection(resolvedConfig)) {
        logger.debug(
          `[MCP Cache] Skipped caching ${count} tools for request-scoped server ${serverName} (user: ${userId})`,
        );
        return;
      }
      if (await isAppSharedConfig(serverName, resolvedConfig)) {
        const appConfigGeneration =
          userId == null
            ? (publicationGeneration ?? configGeneration)
            : (configGeneration ?? publicationGeneration);
        const replaced = await replaceAppServerTools({
          serverName,
          serverTools,
          publicationGeneration: appConfigGeneration,
          publicationRevision,
        });
        if (!replaced) {
          return;
        }
        logger.debug(`Refreshed app-level MCP tools for ${serverName}`);
        return;
      }
      if (setCachedToolsIfCurrent) {
        if (!publicationGeneration || !configGeneration) {
          logger.debug(
            `[MCP Cache] Skipped unfenced or unaddressed discovered tools for ${serverName} (user: ${userId})`,
          );
          return;
        }
        const current = await setCachedToolsIfCurrent(serverTools, {
          userId,
          serverName,
          configGeneration,
          publicationGeneration,
        });
        if (!current) {
          logger.debug(
            `[MCP Cache] Ignored stale discovered tools for ${serverName} (user: ${userId})`,
          );
          return;
        }
      } else {
        await writeCachedTools(serverTools, { userId, serverName, configGeneration });
      }
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
        if (!resolvedConfig) {
          return null;
        }
        const configGeneration = getMCPAppToolsPublicationGeneration(resolvedConfig);
        const serverTools = await getCachedAppServerTools(serverName, configGeneration);
        if (serverTools == null) {
          return null;
        }
        return normalizeCachedToolKeys(serverTools, serverName);
      }
      const configGeneration = resolvedConfig
        ? getMCPAppToolsPublicationGeneration(resolvedConfig)
        : undefined;
      const cached = (await getCachedTools({ userId, serverName, configGeneration })) ?? null;
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
    syncStaticTools,
    mergeAppTools,
    replaceAppServerTools,
    cacheMCPServerTools,
    getMCPServerTools,
  };
}
