import { logger } from '@librechat/data-schemas';
import { Constants, normalizeServerName } from 'librechat-data-provider';
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
  getMissingCustomUserVars,
  hasRuntimeContextPlaceholders,
  requiresEphemeralUserConnection,
} from './utils';

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
  }) => Promise<LCAvailableTools | null>;
  setCachedTools: (
    tools: LCAvailableTools,
    options?: { userId?: string; serverName?: string },
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
    userId: string;
    serverName: string;
    tools: MCPToolInput[] | null;
    serverConfig?: ParsedServerConfig;
    customUserVars?: Record<string, string>;
    tenantId?: string | null;
    role?: string;
    authorizationIdentity?: string | null;
    persistCatalog?: boolean;
    discoveryProvenance?: MCPConnectionProvenance | null;
  }) => Promise<LCAvailableTools>;
  mergeAppTools: (appTools: LCAvailableTools) => Promise<void>;
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
    setCachedTools,
    getMCPServerCatalog: getCachedMCPServerCatalog,
    setMCPServerCatalog,
    getServerConfig,
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
    userId: string;
    serverName: string;
    tools: MCPToolInput[] | null;
    serverConfig?: ParsedServerConfig;
    customUserVars?: Record<string, string>;
    tenantId?: string | null;
    role?: string;
    authorizationIdentity?: string | null;
    persistCatalog?: boolean;
    discoveryProvenance?: MCPConnectionProvenance | null;
  }): Promise<LCAvailableTools> {
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

      if (tools.length === 0) {
        if (!usesScopedCatalog) {
          if (!(await isRequestScoped(userId, serverName, serverConfig))) {
            const persisted = await setCachedTools(serverTools, { userId, serverName });
            if (persisted) {
              logger.debug(
                `[MCP Cache] Cleared stale tools for server ${serverName} (user: ${userId})`,
              );
            }
          }
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
          !(await isRequestScoped(userId, serverName, serverConfig)) &&
          !(await isUncatalogedUserScope(userId, serverName, serverConfig))
        ) {
          const resolvedConfig = serverConfig ?? (await getServerConfig(serverName, userId));
          if (
            !resolvedConfig ||
            getMissingCustomUserVars(resolvedConfig, customUserVars).length > 0
          ) {
            return serverTools;
          }
          const securityPolicyIdentity = await getSecurityPolicyIdentity({
            userId,
            tenantId: tenantId ?? null,
            role,
          });
          if (securityPolicyIdentity) {
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
            if (hasMatchingDiscoveryProvenance(discoveryProvenance, scopeInput)) {
              const persisted = await persistMCPToolCatalog(
                createMCPToolCatalogEnvelope(serverTools, scopeInput),
                {
                  userId,
                  serverName,
                  tenantId: tenantId ?? null,
                },
              );
              if (persisted) {
                logger.debug(
                  `[MCP Cache] Cleared stale tools for server ${serverName} (user: ${userId})`,
                );
              }
            }
          }
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
            outputSchema: tool.outputSchema,
            annotations: tool.annotations,
          },
        };
        serverTools[name] = entry;
      }

      if (!usesScopedCatalog) {
        if (await isRequestScoped(userId, serverName, serverConfig)) {
          logger.debug(
            `[MCP Cache] Built ${tools.length} tools for request-scoped server ${serverName} (user: ${userId}) without caching`,
          );
          return serverTools;
        }
        const persisted = await setCachedTools(serverTools, { userId, serverName });
        if (persisted) {
          logger.debug(
            `[MCP Cache] Updated ${tools.length} tools for server ${serverName} (user: ${userId})`,
          );
        }
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

  async function mergeAppTools(appTools: LCAvailableTools): Promise<void> {
    try {
      const count = Object.keys(appTools).length;
      if (!count) {
        return;
      }
      const cached = await getCachedTools();
      const cachedTools = cached && !isMCPToolCatalogEnvelope(cached) ? cached : {};
      const mergedTools: LCAvailableTools = { ...cachedTools, ...appTools };
      await setCachedTools(mergedTools);
      logger.debug(`Merged ${count} app-level tools`);
    } catch (error) {
      logger.error('Failed to merge app-level tools:', error);
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
      const persisted = await setCachedTools(serverTools, { userId, serverName });
      if (persisted) {
        logger.debug(`Cached ${count} MCP server tools for ${serverName} (user: ${userId})`);
      }
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
    if (await isRequestScoped(userId, serverName, serverConfig)) {
      return null;
    }
    try {
      const cached = await getCachedTools({ userId, serverName });
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
    mergeAppTools,
    cacheMCPServerTools,
    cacheScopedMCPServerTools,
    getMCPServerTools,
    getScopedMCPServerTools,
    getMCPServerCatalog,
  };
}
