import { logger } from '@librechat/data-schemas';
import { Constants, buildServerNameAliases, normalizeServerName } from 'librechat-data-provider';
import type { JsonSchemaType } from '@librechat/agents';
import type {
  LCAvailableTools,
  LCFunctionTool,
  MCPConnectionProvenance,
  MCPTool,
  ParsedServerConfig,
} from './types';
import type {
  MCPToolCatalogEnvelope,
  MCPToolCatalogResult,
  MCPToolCatalogScopeInput,
} from './catalog';
import {
  createMCPToolCatalogSecurityPolicyIdentity,
  createMCPToolCatalogEnvelope,
  isMCPToolCatalogEnvelope,
  isMCPToolCatalogFingerprintAvailable,
  matchesMCPConnectionProvenance,
  resolveMCPToolCatalog,
} from './catalog';
import {
  canUseAppConnection,
  getMissingCustomUserVars,
  hasRuntimeContextPlaceholders,
  requiresEphemeralUserConnection,
} from './utils';
import { getMCPAppToolsPublicationGeneration } from './toolsChanged';
import { normalizeJsonSchema, resolveJsonSchemaRefs } from './zod';

export interface MCPToolInput {
  name: string;
  description?: string;
  inputSchema?: JsonSchemaType;
  outputSchema?: MCPTool['outputSchema'];
  annotations?: LCFunctionTool['function']['annotations'];
}

export interface MCPServerToolCacheParams {
  userId: string;
  serverName: string;
  serverTools: LCAvailableTools;
  serverConfig?: ParsedServerConfig;
  publicationGeneration?: string;
  publicationRevision?: string;
}

export interface MCPScopedServerToolCacheParams extends MCPServerToolCacheParams {
  customUserVars?: Record<string, string>;
  tenantId: string | null;
  role?: string;
  authorizationIdentity: string | null;
  authoritative?: boolean;
  discoveryProvenance?: MCPConnectionProvenance | null;
}

export interface MCPScopedServerToolReadParams {
  userId: string;
  serverName: string;
  serverConfig: ParsedServerConfig;
  customUserVars?: Record<string, string>;
  tenantId: string | null;
  role?: string;
  authorizationIdentity: string | null;
  authorizationKind?: MCPConnectionProvenance['authorizationKind'];
  securityPolicyIdentity?: string;
}

export interface MCPToolCatalogPrincipal {
  userId: string;
  tenantId: string | null;
  role?: string;
}

export interface MCPToolCacheDeps {
  getCachedTools: (options?: {
    userId?: string;
    serverName?: string;
    tenantId?: string | null;
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
  getCachedAppServerTools?: (
    serverName: string,
    configGeneration: string,
  ) => Promise<LCAvailableTools | null>;
  setCachedAppServerTools?: (
    serverName: string,
    configGeneration: string,
    tools: LCAvailableTools,
    publicationRevision?: string,
  ) => Promise<boolean>;
  getMCPServerCatalog?: (options: {
    userId: string;
    serverName: string;
    tenantId: string | null;
  }) => Promise<MCPToolCatalogEnvelope | null>;
  setMCPServerCatalog?: (
    envelope: MCPToolCatalogEnvelope,
    options: { userId: string; serverName: string; tenantId: string | null },
  ) => Promise<boolean>;
  getServerConfig: (serverName: string, userId?: string) => Promise<ParsedServerConfig | undefined>;
  getAllServerConfigs?: () => Promise<Record<string, ParsedServerConfig>>;
  isAppServerConfig?: (serverName: string, effectiveConfig: ParsedServerConfig) => Promise<boolean>;
  /** @deprecated Scoped catalogs must use getScopedSecurityPolicy. */
  getSecurityPolicy?: (userId: string) => Promise<{
    allowedDomains?: string[] | null;
    allowedAddresses?: string[] | null;
  }>;
  getScopedSecurityPolicy?: (principal: MCPToolCatalogPrincipal) => Promise<{
    allowedDomains?: string[] | null;
    allowedAddresses?: string[] | null;
  }>;
}

export interface MCPToolCacheService {
  updateMCPServerTools: (params: {
    userId?: string;
    serverName: string;
    tools: MCPToolInput[] | null;
    serverConfig?: ParsedServerConfig;
    customUserVars?: Record<string, string>;
    tenantId?: string | null;
    role?: string;
    authorizationIdentity?: string | null;
    persistCatalog?: boolean;
    discoveryProvenance?: MCPConnectionProvenance | null;
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
  cacheMCPServerTools: (
    params: MCPServerToolCacheParams | MCPScopedServerToolCacheParams,
  ) => Promise<void>;
  cacheScopedMCPServerTools: (params: MCPScopedServerToolCacheParams) => Promise<void>;
  getMCPServerTools: (
    userId: string,
    serverName: string,
    serverConfig?: ParsedServerConfig,
    customUserVars?: Record<string, string>,
    tenantId?: string | null,
    authorizationIdentity?: string | null,
  ) => Promise<LCAvailableTools | null>;
  getScopedMCPServerTools: (
    params: MCPScopedServerToolReadParams,
  ) => Promise<LCAvailableTools | null>;
  getMCPServerCatalog: (params: {
    userId: string;
    serverName: string;
    serverConfig: ParsedServerConfig;
    customUserVars?: Record<string, string>;
    tenantId: string | null;
    role?: string;
    authorizationIdentity: string;
    authorizationKind?: MCPConnectionProvenance['authorizationKind'];
    securityPolicyIdentity?: string;
  }) => Promise<MCPToolCatalogResult>;
}

export function createMCPToolCacheService(deps: MCPToolCacheDeps): MCPToolCacheService {
  const {
    getCachedTools,
    updateCachedGlobalTools,
    setCachedTools,
    setCachedToolsIfCurrent,
    getCachedAppServerTools,
    setCachedAppServerTools,
    getMCPServerCatalog: getCachedMCPServerCatalog,
    setMCPServerCatalog,
    getServerConfig,
    getAllServerConfigs,
    isAppServerConfig,
    getScopedSecurityPolicy,
  } = deps;

  async function getSecurityPolicyIdentity(
    principal: MCPToolCatalogPrincipal,
  ): Promise<string | null> {
    if (!isMCPToolCatalogFingerprintAvailable() || !getScopedSecurityPolicy) {
      return null;
    }
    try {
      return createMCPToolCatalogSecurityPolicyIdentity(await getScopedSecurityPolicy(principal));
    } catch (error) {
      logger.warn(
        `[MCP Cache] Security policy scope unavailable for user ${principal.userId}`,
        error,
      );
      return null;
    }
  }

  async function persistMCPToolCatalog(
    envelope: MCPToolCatalogEnvelope,
    options: { userId: string; serverName: string; tenantId: string | null },
  ): Promise<boolean> {
    if (!setMCPServerCatalog) {
      return false;
    }
    try {
      return await setMCPServerCatalog(envelope, options);
    } catch (error) {
      logger.warn(
        `[MCP Cache] Catalog write unavailable for ${options.serverName}; live tools remain usable`,
        error,
      );
      return false;
    }
  }

  function hasMatchingDiscoveryProvenance(
    provenance: MCPConnectionProvenance | null | undefined,
    input: MCPToolCatalogScopeInput,
  ): boolean {
    return matchesMCPConnectionProvenance(provenance, input);
  }

  async function writeCachedTools(
    tools: LCAvailableTools,
    options?: { userId?: string; serverName?: string; configGeneration?: string },
  ): Promise<void> {
    const success = options ? await setCachedTools(tools, options) : await setCachedTools(tools);
    if (success === false) {
      throw new Error('Tool cache rejected the write');
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

  interface AppServerBoundary {
    serverName: string;
    suffix: string;
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
      return false;
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

  async function isRequestScoped(
    userId: string | undefined,
    serverName: string,
    serverConfig?: ParsedServerConfig,
  ): Promise<boolean> {
    const config = await resolveCacheConfig(userId, serverName, serverConfig);
    return config ? requiresEphemeralUserConnection(config) : false;
  }

  async function isUncatalogedUserScope(
    userId: string,
    serverName: string,
    serverConfig?: ParsedServerConfig,
  ): Promise<boolean> {
    try {
      const config = serverConfig ?? (await getServerConfig(serverName, userId));
      return config?.obo != null || (config ? hasRuntimeContextPlaceholders(config) : false);
    } catch (error) {
      logger.debug(`[MCP Cache] User scope unavailable for ${serverName}; skipping catalog`, error);
      return true;
    }
  }

  async function updateMCPServerTools(params: {
    userId?: string;
    serverName: string;
    tools: MCPToolInput[] | null;
    serverConfig?: ParsedServerConfig;
    customUserVars?: Record<string, string>;
    tenantId?: string | null;
    role?: string;
    authorizationIdentity?: string | null;
    persistCatalog?: boolean;
    discoveryProvenance?: MCPConnectionProvenance | null;
    publicationGeneration?: string;
    publicationRevision?: string;
  }): Promise<LCAvailableTools | null> {
    const {
      userId,
      serverName,
      tools,
      serverConfig,
      customUserVars,
      tenantId,
      role,
      authorizationIdentity,
      persistCatalog: requestedCatalogPersistence,
      discoveryProvenance,
      publicationGeneration,
      publicationRevision,
    } = params;
    const usesScopedCatalog =
      customUserVars !== undefined ||
      tenantId !== undefined ||
      role !== undefined ||
      authorizationIdentity !== undefined ||
      requestedCatalogPersistence !== undefined ||
      discoveryProvenance !== undefined;
    const persistCatalog =
      requestedCatalogPersistence ??
      (usesScopedCatalog && authorizationIdentity != null && tenantId !== undefined);
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
            outputSchema: tool.outputSchema,
            annotations: tool.annotations,
          },
        };
        serverTools[name] = entry;
      }

      if (!usesScopedCatalog) {
        const resolvedConfig = await resolveCacheConfig(userId, serverName, serverConfig);
        if (resolvedConfig && requiresEphemeralUserConnection(resolvedConfig)) {
          logger.debug(
            `[MCP Cache] Built ${tools.length} tools for request-scoped server ${serverName} (user: ${userId}) without caching`,
          );
          return serverTools;
        }
        const configGeneration = resolvedConfig
          ? getMCPAppToolsPublicationGeneration(resolvedConfig)
          : undefined;
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
            await writeCachedTools(
              serverTools,
              setCachedToolsIfCurrent
                ? { userId, serverName, configGeneration }
                : { userId, serverName },
            );
          }
        } else {
          const appConfigGeneration = userId
            ? (configGeneration ?? publicationGeneration)
            : (publicationGeneration ?? configGeneration);
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
      }

      if (!userId) {
        logger.debug(`[MCP Cache] Skipped scoped catalog write without a user for ${serverName}`);
        return serverTools;
      }

      if (
        !persistCatalog ||
        tenantId === undefined ||
        authorizationIdentity == null ||
        !isMCPToolCatalogFingerprintAvailable()
      ) {
        return serverTools;
      }

      if (
        (await isRequestScoped(userId, serverName, serverConfig)) ||
        (await isUncatalogedUserScope(userId, serverName, serverConfig))
      ) {
        logger.debug(
          `[MCP Cache] Built ${tools.length} tools for non-persistable server ${serverName} (user: ${userId}) without caching`,
        );
        return serverTools;
      }

      const resolvedConfig = serverConfig ?? (await getServerConfig(serverName, userId));
      if (!resolvedConfig) {
        logger.debug(`[MCP Cache] Skipped catalog write for unresolved server ${serverName}`);
        return serverTools;
      }
      if (getMissingCustomUserVars(resolvedConfig, customUserVars).length > 0) {
        logger.debug(
          `[MCP Cache] Skipped catalog write with incomplete credentials for ${serverName}`,
        );
        return serverTools;
      }
      const securityPolicyIdentity = await getSecurityPolicyIdentity({
        userId,
        tenantId: tenantId ?? null,
        role,
      });
      if (!securityPolicyIdentity) {
        return serverTools;
      }
      const scopeInput = {
        tenantId: tenantId ?? null,
        userId,
        serverName,
        serverConfig: resolvedConfig,
        securityPolicyIdentity,
        customUserVars,
        authorizationIdentity,
        authorizationKind: discoveryProvenance?.authorizationKind,
      };
      if (!hasMatchingDiscoveryProvenance(discoveryProvenance, scopeInput)) {
        return serverTools;
      }
      const persisted = await persistMCPToolCatalog(
        createMCPToolCatalogEnvelope(serverTools, scopeInput),
        { userId, serverName, tenantId: tenantId ?? null },
      );
      if (persisted) {
        logger.debug(
          `[MCP Cache] Updated ${tools.length} tools for server ${serverName} (user: ${userId})`,
        );
      }
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
          .filter(([, config]) => config.toolFunctions != null && setCachedAppServerTools != null)
          .map(async ([serverName, config]) => {
            const serverTools = getAppServerSlice(appTools, serverName, boundaries);
            const configGeneration = getMCPAppToolsPublicationGeneration(config);
            await setCachedAppServerTools!(serverName, configGeneration, serverTools);
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
      if (!configGeneration) {
        logger.debug(`[MCP Cache] Skipped unaddressed app-level publication for ${serverName}`);
        return false;
      }
      if (!publicationRevision) {
        logger.debug(`[MCP Cache] Skipped unordered app-level publication for ${serverName}`);
        return false;
      }
      if (!setCachedAppServerTools) {
        return false;
      }
      const replaced = await setCachedAppServerTools(
        serverName,
        configGeneration,
        serverTools,
        publicationRevision,
      );
      if (!replaced) {
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

  async function cacheScopedMCPServerToolsInternal(params: {
    userId: string;
    serverName: string;
    serverTools: LCAvailableTools;
    serverConfig?: ParsedServerConfig;
    customUserVars?: Record<string, string>;
    tenantId?: string | null;
    role?: string;
    authorizationIdentity?: string | null;
    authoritative?: boolean;
    discoveryProvenance?: MCPConnectionProvenance | null;
  }): Promise<void> {
    const {
      userId,
      serverName,
      serverTools,
      serverConfig,
      customUserVars,
      tenantId,
      role,
      authorizationIdentity,
      authoritative = false,
      discoveryProvenance,
    } = params;
    try {
      const count = Object.keys(serverTools).length;
      if (!count && !authoritative) {
        return;
      }
      if (tenantId === undefined || authorizationIdentity == null) {
        logger.debug(`[MCP Cache] Skipped catalog write without auth scope for ${serverName}`);
        return;
      }
      if (!isMCPToolCatalogFingerprintAvailable()) {
        logger.debug(`[MCP Cache] Skipped catalog write without fingerprint key for ${serverName}`);
        return;
      }
      if (
        (await isRequestScoped(userId, serverName, serverConfig)) ||
        (await isUncatalogedUserScope(userId, serverName, serverConfig))
      ) {
        logger.debug(
          `[MCP Cache] Skipped caching ${count} tools for request-scoped server ${serverName} (user: ${userId})`,
        );
        return;
      }
      const resolvedConfig = serverConfig ?? (await getServerConfig(serverName, userId));
      if (!resolvedConfig) {
        logger.debug(`[MCP Cache] Skipped catalog write for unresolved server ${serverName}`);
        return;
      }
      if (getMissingCustomUserVars(resolvedConfig, customUserVars).length > 0) {
        logger.debug(
          `[MCP Cache] Skipped catalog write with incomplete credentials for ${serverName}`,
        );
        return;
      }
      const securityPolicyIdentity = await getSecurityPolicyIdentity({
        userId,
        tenantId: tenantId ?? null,
        role,
      });
      if (!securityPolicyIdentity) {
        return;
      }
      const scopeInput = {
        tenantId: tenantId ?? null,
        userId,
        serverName,
        serverConfig: resolvedConfig,
        securityPolicyIdentity,
        customUserVars,
        authorizationIdentity,
        authorizationKind: discoveryProvenance?.authorizationKind,
      };
      if (!hasMatchingDiscoveryProvenance(discoveryProvenance, scopeInput)) {
        logger.debug(`[MCP Cache] Skipped catalog write with stale provenance for ${serverName}`);
        return;
      }
      const persisted = await persistMCPToolCatalog(
        createMCPToolCatalogEnvelope(serverTools, scopeInput),
        { userId, serverName, tenantId: tenantId ?? null },
      );
      if (persisted) {
        logger.debug(`Cached ${count} MCP server tools for ${serverName} (user: ${userId})`);
      }
    } catch (error) {
      logger.error(`Failed to cache MCP server tools for ${serverName} (user: ${userId}):`, error);
      throw error;
    }
  }

  async function cacheScopedMCPServerTools(params: MCPScopedServerToolCacheParams): Promise<void> {
    return cacheScopedMCPServerToolsInternal(params);
  }

  function hasScopedCacheFields(
    params: MCPServerToolCacheParams | MCPScopedServerToolCacheParams,
  ): boolean {
    return (
      'customUserVars' in params ||
      'tenantId' in params ||
      'role' in params ||
      'authorizationIdentity' in params ||
      'authoritative' in params ||
      'discoveryProvenance' in params
    );
  }

  async function cacheMCPServerTools(
    params: MCPServerToolCacheParams | MCPScopedServerToolCacheParams,
  ): Promise<void> {
    if (hasScopedCacheFields(params)) {
      return cacheScopedMCPServerToolsInternal(params);
    }

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
        const appConfigGeneration = configGeneration ?? publicationGeneration;
        const replaced = await replaceAppServerTools({
          serverName,
          serverTools,
          publicationGeneration: appConfigGeneration,
          publicationRevision,
        });
        if (replaced) {
          logger.debug(`Refreshed app-level MCP tools for ${serverName}`);
        }
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
        await writeCachedTools(
          serverTools,
          setCachedToolsIfCurrent
            ? { userId, serverName, configGeneration }
            : { userId, serverName },
        );
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

  async function getScopedMCPServerToolsInternal(params: {
    userId: string;
    serverName: string;
    serverConfig?: ParsedServerConfig;
    customUserVars?: Record<string, string>;
    tenantId?: string | null;
    role?: string;
    authorizationIdentity?: string | null;
    authorizationKind?: MCPConnectionProvenance['authorizationKind'];
    securityPolicyIdentity?: string;
  }): Promise<LCAvailableTools | null> {
    const {
      userId,
      serverName,
      serverConfig,
      customUserVars,
      tenantId,
      role,
      authorizationIdentity,
      authorizationKind,
      securityPolicyIdentity,
    } = params;
    if (tenantId === undefined || authorizationIdentity == null) {
      return null;
    }
    const resolvedConfig = serverConfig ?? (await getServerConfig(serverName, userId));
    if (
      !resolvedConfig ||
      (await isRequestScoped(userId, serverName, resolvedConfig)) ||
      (await isUncatalogedUserScope(userId, serverName, resolvedConfig))
    ) {
      return null;
    }
    const result = await getMCPServerCatalog({
      userId,
      serverName,
      serverConfig: resolvedConfig,
      customUserVars,
      tenantId: tenantId ?? null,
      role,
      authorizationIdentity: authorizationIdentity ?? 'none',
      authorizationKind,
      securityPolicyIdentity,
    });
    return result.status === 'ready' ? result.tools : null;
  }

  async function getScopedMCPServerTools(
    params: MCPScopedServerToolReadParams,
  ): Promise<LCAvailableTools | null> {
    return getScopedMCPServerToolsInternal(params);
  }

  async function getMCPServerTools(
    userId: string,
    serverName: string,
    serverConfig?: ParsedServerConfig,
    customUserVars?: Record<string, string>,
    tenantId?: string | null,
    authorizationIdentity?: string | null,
  ): Promise<LCAvailableTools | null> {
    if (
      customUserVars !== undefined ||
      tenantId !== undefined ||
      authorizationIdentity !== undefined
    ) {
      return getScopedMCPServerToolsInternal({
        userId,
        serverName,
        serverConfig,
        customUserVars,
        tenantId,
        authorizationIdentity,
      });
    }
    const resolvedConfig = await resolveCacheConfig(userId, serverName, serverConfig);
    if (resolvedConfig && requiresEphemeralUserConnection(resolvedConfig)) {
      return null;
    }
    try {
      if (await isAppSharedConfig(serverName, resolvedConfig)) {
        if (!resolvedConfig || !getCachedAppServerTools) {
          return null;
        }
        const configGeneration = getMCPAppToolsPublicationGeneration(resolvedConfig);
        const serverTools = await getCachedAppServerTools(serverName, configGeneration);
        return serverTools == null ? null : normalizeCachedToolKeys(serverTools, serverName);
      }
      const configGeneration = resolvedConfig
        ? getMCPAppToolsPublicationGeneration(resolvedConfig)
        : undefined;
      const cached = await getCachedTools({ userId, serverName, configGeneration });
      if (!cached || isMCPToolCatalogEnvelope(cached) || Object.keys(cached).length === 0) {
        return null;
      }
      return normalizeCachedToolKeys(cached, serverName);
    } catch (error) {
      logger.error(`[getMCPServerTools] Error fetching cached tools for ${serverName}:`, error);
      return null;
    }
  }

  async function getMCPServerCatalog(params: {
    userId: string;
    serverName: string;
    serverConfig: ParsedServerConfig;
    customUserVars?: Record<string, string>;
    tenantId: string | null;
    role?: string;
    authorizationIdentity: string;
    authorizationKind?: MCPConnectionProvenance['authorizationKind'];
    securityPolicyIdentity?: string;
  }): Promise<MCPToolCatalogResult> {
    const {
      userId,
      serverName,
      serverConfig,
      customUserVars,
      tenantId,
      role,
      authorizationIdentity,
      authorizationKind,
      securityPolicyIdentity: suppliedSecurityPolicyIdentity,
    } = params;
    if (!isMCPToolCatalogFingerprintAvailable()) {
      return { status: 'pending_activation', reason: 'authorization_unavailable' };
    }
    if (!getCachedMCPServerCatalog) {
      return { status: 'pending_activation', reason: 'authorization_unavailable' };
    }
    if (await isRequestScoped(userId, serverName, serverConfig)) {
      return { status: 'pending_activation', reason: 'request_scoped' };
    }
    if (await isUncatalogedUserScope(userId, serverName, serverConfig)) {
      return { status: 'pending_activation', reason: 'user_scoped' };
    }
    if (getMissingCustomUserVars(serverConfig, customUserVars).length > 0) {
      return { status: 'pending_activation', reason: 'missing_credentials' };
    }
    const securityPolicyIdentity =
      suppliedSecurityPolicyIdentity ??
      (await getSecurityPolicyIdentity({ userId, tenantId, role }));
    if (!securityPolicyIdentity) {
      return { status: 'pending_activation', reason: 'authorization_unavailable' };
    }
    try {
      const cached = await getCachedMCPServerCatalog({ userId, serverName, tenantId });
      const result = resolveMCPToolCatalog(cached, {
        tenantId,
        userId,
        serverName,
        serverConfig,
        securityPolicyIdentity,
        customUserVars,
        authorizationIdentity,
        authorizationKind,
      });
      if (result.status !== 'ready') {
        return result;
      }
      return {
        ...result,
        tools: normalizeCachedToolKeys(result.tools, serverName) ?? {},
      };
    } catch (error) {
      logger.error(`[getMCPServerCatalog] Error fetching cached tools for ${serverName}:`, error);
      return { status: 'pending_activation', reason: 'cold' };
    }
  }

  return {
    updateMCPServerTools,
    syncStaticTools,
    mergeAppTools,
    replaceAppServerTools,
    cacheMCPServerTools,
    cacheScopedMCPServerTools,
    getMCPServerTools,
    getScopedMCPServerTools,
    getMCPServerCatalog,
  };
}
