import { RE2JS } from 're2js';
import pick from 'lodash/pick';
import { logger } from '@librechat/data-schemas';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { CallToolResultSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type {
  ListResourcesResult,
  ListResourceTemplatesResult,
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { TokenMethods, IUser } from '@librechat/data-schemas';
import type { UIResource } from 'librechat-data-provider';
import type { OboTokenResolver, OboTrustChecker } from '~/mcp/oauth/obo';
import type { GraphTokenResolver } from '~/utils/graph';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens } from './oauth';
import type { RequestBody } from '~/types';
import type * as t from './types';
import {
  getMissingRuntimeBodyPlaceholderFields,
  canUseAppConnection,
  hasCustomUserVars,
  isOAuthServer,
  isUserSourced,
  requiresEphemeralUserConnection,
  requiresOAuthMachinery,
  requiresUserScopedConnection,
} from './utils';
import { getMCPAppToolsPublicationGeneration, getMCPToolsChangedGeneration } from './toolsChanged';
import { mcpOptionsContainGraphTokenPlaceholder, preProcessGraphTokens } from '~/utils/graph';
import { formatToolContent, resultHasRenderableUiResource } from './parsers';
import { MCPServersInitializer } from './registry/MCPServersInitializer';
import { OboTokenResolutionError, resolveOboToken } from '~/mcp/oauth';
import { getToolUiResourceUri, isToolHiddenFromApp } from './apps';
import { MCPServerInspector } from './registry/MCPServerInspector';
import { MCPServersRegistry } from './registry/MCPServersRegistry';
import { UserConnectionManager } from './UserConnectionManager';
import { ConnectionsRepository } from './ConnectionsRepository';
import { MCPConnectionFactory } from './MCPConnectionFactory';
import { processMCPEnv, isPluginSourced } from '~/utils/env';
import { MCPConnection } from './connection';

/** One RFC 6570 varspec: its name plus the single modifier it may carry. */
interface UriTemplateVarSpec {
  name: string;
  prefix?: number;
  explode: boolean;
}

function createOboToolCallErrorMessage(
  logPrefix: string,
  toolName: string,
  error: OboTokenResolutionError,
): string {
  let failureSuffix = 'Re-authenticate the user and retry.';

  if (error.retryable) {
    failureSuffix = 'Please retry.';
  } else if (error.reason === 'exchange_failed') {
    failureSuffix = 'Re-authenticate the user or verify the configured OBO scopes and retry.';
  }

  return `${logPrefix} ${error.userMessage} Cannot execute tool ${toolName}. ${failureSuffix}`;
}

/**
 * Centralized manager for MCP server connections and tool execution.
 * Extends UserConnectionManager to handle both app-level and user-specific connections.
 */
export class MCPManager extends UserConnectionManager {
  private static instance: MCPManager | null;
  private readonly resourceUriCache = new Map<
    string,
    Map<string, { uri: string; csp?: UIResource['csp']; permissions?: UIResource['permissions'] }>
  >();

  private readonly appHiddenToolCache = new Map<string, Set<string>>();
  private readonly knownToolNamesCache = new Map<string, Set<string>>();
  /**
   * Stamp of the connection each cache entry was built from, to detect reconnects (createdAt) and
   * live tools/list_changed notifications (toolListVersion) that createdAt alone would miss.
   */
  private readonly toolCacheConnStamp = new Map<string, string>();
  /**
   * Snapshot of the resources a server advertises, used to authorize app-driven `resources/read`
   * so an embedded app can only proxy publicly exposed resources, not arbitrary reachable URIs.
   */
  private readonly advertisedResourceCache = new Map<
    string,
    { uris: Set<string>; templates: RE2JS[]; complete: boolean }
  >();

  private readonly advertisedResourceConnStamp = new Map<string, string>();
  private static readonly RESOURCE_LIST_MAX_PAGES = 20;
  private static readonly RESOURCE_LIST_MAX_ENTRIES = 5000;
  /** RFC 6570 §2.2 reserves these expression operators; a template using one is not matchable here. */
  private static readonly RESERVED_TEMPLATE_OPERATOR = /^[=,!@|]/;
  /** RE2 rejects a repeat count above this, so a larger RFC 6570 prefix cannot be compiled as one. */
  private static readonly MAX_REPEAT_COUNT = 1000;
  private static readonly MAX_PREFIXED_TEMPLATE_VARS = 8;

  /** Creates and initializes the singleton MCPManager instance */
  public static async createInstance(configs: t.MCPServers): Promise<MCPManager> {
    if (MCPManager.instance) throw new Error('MCPManager has already been initialized.');
    MCPManager.instance = new MCPManager();
    await MCPManager.instance.initialize(configs);
    return MCPManager.instance;
  }

  /** Returns the singleton MCPManager instance */
  public static getInstance(): MCPManager {
    if (!MCPManager.instance) throw new Error('MCPManager has not been initialized.');
    return MCPManager.instance;
  }

  /** Initializes the MCPManager by setting up server registry and app connections */
  public async initialize(configs: t.MCPServers): Promise<void> {
    await MCPServersInitializer.initialize(configs);
    this.appConnections = new ConnectionsRepository(undefined);
  }

  /** Retrieves an app-level or user-specific connection based on provided arguments */
  public async getConnection(
    args: {
      serverName: string;
      user?: IUser;
      forceNew?: boolean;
      flowManager?: FlowStateManager<MCPOAuthTokens | null>;
      /** Pre-resolved config for config-source servers not in YAML/DB */
      serverConfig?: t.ParsedServerConfig;
      customUserVars?: Record<string, string>;
    } & Omit<t.OAuthConnectionOptions, 'useOAuth' | 'user' | 'flowManager'>,
  ): Promise<MCPConnection> {
    const userId = args.user?.id;
    const effectiveConfig =
      args.serverConfig ??
      (userId
        ? await MCPServersRegistry.getInstance().getServerConfig(args.serverName, userId)
        : undefined);

    if (effectiveConfig && userId && requiresUserScopedConnection(effectiveConfig)) {
      return this.getUserConnection({
        ...args,
        serverConfig: effectiveConfig,
      } as Parameters<typeof this.getUserConnection>[0]);
    }

    //the get method checks if the config is still valid as app level
    const existingAppConnection = await this.appConnections!.get(args.serverName);
    if (existingAppConnection) {
      return existingAppConnection;
    } else if (userId) {
      return this.getUserConnection({
        ...args,
        serverConfig: effectiveConfig,
      } as Parameters<typeof this.getUserConnection>[0]);
    } else {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `No connection found for server ${args.serverName}`,
      );
    }
  }

  /**
   * Discovers tools from an MCP server, even when OAuth is required.
   * Per MCP spec, tool listing should be possible without authentication.
   * Use this for agent initialization to get tool schemas before OAuth flow.
   */
  public async discoverServerTools(args: t.ToolDiscoveryOptions): Promise<t.ToolDiscoveryResult> {
    const { serverName, user } = args;
    const logPrefix = user?.id ? `[MCP][User: ${user.id}][${serverName}]` : `[MCP][${serverName}]`;

    try {
      const existingAppConnection = await this.appConnections?.get(serverName);
      if (existingAppConnection && (await existingAppConnection.isConnected())) {
        const snapshot = await existingAppConnection.fetchOrderedToolsSnapshot();
        return {
          tools: snapshot.complete ? snapshot.tools : null,
          oauthRequired: false,
          oauthUrl: null,
        };
      }
    } catch {
      logger.debug(`${logPrefix} [Discovery] App connection not available, trying discovery mode`);
    }

    const serverConfig = await MCPServersRegistry.getInstance().getServerConfig(
      serverName,
      user?.id,
      args.configServers,
    );

    if (!serverConfig) {
      logger.warn(`${logPrefix} [Discovery] Server config not found`);
      return { tools: null, oauthRequired: false, oauthUrl: null };
    }

    const missingBodyFields = getMissingRuntimeBodyPlaceholderFields(
      serverConfig,
      args.requestBody,
    );
    if (missingBodyFields.length > 0) {
      logger.warn(
        `${logPrefix} [Discovery] Request body field(s) required to resolve runtime MCP placeholders: ${missingBodyFields.join(', ')}`,
      );
      return { tools: null, oauthRequired: false, oauthUrl: null };
    }

    const registry = MCPServersRegistry.getInstance();
    const { allowedDomains, allowedAddresses, useSSRFProtection } =
      await registry.resolveAllowlists({ userId: user?.id, role: user?.role });
    await this.assertResolvedRuntimeConfigAllowed({
      config: serverConfig,
      user,
      customUserVars: args.customUserVars,
      requestBody: args.requestBody,
      graphTokenResolver: args.graphTokenResolver,
      allowedDomains,
      allowedAddresses,
      logPrefix: `${logPrefix} [Discovery]`,
    });

    const useOAuth = requiresOAuthMachinery(serverConfig);
    const dbSourced = isUserSourced(serverConfig);
    const basic: t.BasicConnectionOptions = {
      dbSourced,
      serverName,
      serverConfig,
      useSSRFProtection,
      allowedDomains,
      allowedAddresses,
    };

    const finalizeDiscoveryResult = async (
      result: Awaited<ReturnType<typeof MCPConnectionFactory.discoverTools>>,
    ): Promise<t.ToolDiscoveryResult> => {
      if (result.connection) {
        try {
          await result.connection.dispose();
        } catch (error) {
          logger.warn(`${logPrefix} [Discovery] Failed to dispose discovery connection`, error);
        }
      }
      return {
        tools: result.tools,
        oauthRequired: result.oauthRequired,
        oauthUrl: result.oauthUrl,
      };
    };

    if (!useOAuth) {
      const result = await MCPConnectionFactory.discoverTools(basic, {
        user: args.user,
        customUserVars: args.customUserVars,
        requestBody: args.requestBody,
        graphTokenResolver: args.graphTokenResolver,
        connectionTimeout: args.connectionTimeout,
      });
      return finalizeDiscoveryResult(result);
    }

    if (!user || !args.flowManager) {
      logger.warn(`${logPrefix} [Discovery] OAuth server requires user and flowManager`);
      return { tools: null, oauthRequired: true, oauthUrl: null };
    }

    const result = await MCPConnectionFactory.discoverTools(basic, {
      user,
      useOAuth: true,
      flowManager: args.flowManager,
      tokenMethods: args.tokenMethods,
      signal: args.signal,
      oauthStart: args.oauthStart,
      customUserVars: args.customUserVars,
      requestBody: args.requestBody,
      graphTokenResolver: args.graphTokenResolver,
      connectionTimeout: args.connectionTimeout,
      oboTokenResolver: args.oboTokenResolver,
      oboTrustChecker: args.oboTrustChecker,
    });

    return finalizeDiscoveryResult(result);
  }

  /** Returns all available tool functions from app-level connections */
  public async getAppToolFunctions(): Promise<t.LCAvailableTools> {
    const toolFunctions: t.LCAvailableTools = {};
    const configs = await MCPServersRegistry.getInstance().getAllServerConfigs();
    for (const config of Object.values(configs)) {
      if (canUseAppConnection(config) && config.toolFunctions != null) {
        Object.assign(toolFunctions, config.toolFunctions);
      }
    }
    return toolFunctions;
  }

  /** Opens eligible app-shared sessions after the inspected startup catalog has been cached. */
  public async connectAppServers(): Promise<void> {
    try {
      const configs = await MCPServersRegistry.getInstance().getAllServerConfigs();
      const serverNames = Object.entries(configs)
        .filter(([, config]) => canUseAppConnection(config))
        .map(([serverName]) => serverName);
      const connections = await this.appConnections?.getMany(serverNames, {
        continueOnError: true,
        refreshTools: false,
      });
      if (!connections) {
        return;
      }
      await Promise.all(
        Array.from(connections.values(), (connection) => connection.refreshToolList()),
      );
    } catch (error) {
      logger.warn('[MCP] Failed to establish one or more app connections after inspection', error);
    }
  }

  /** Closes app-shared MCP sessions during graceful process shutdown. */
  public async disconnectAppServers(): Promise<void> {
    await Promise.all(this.appConnections?.disconnectAll() ?? []);
  }

  /** Returns tool functions with the generation bound to their originating user connection. */
  public async getServerToolFunctionsSnapshot(
    userId: string,
    serverName: string,
    serverConfig?: t.ParsedServerConfig,
  ): Promise<{
    tools: t.LCAvailableTools | null;
    publicationGeneration?: string;
  }> {
    try {
      const registry = MCPServersRegistry.getInstance();
      const effectiveConfig = serverConfig ?? (await registry.getServerConfig(serverName, userId));
      const useAppConnection =
        effectiveConfig != null &&
        canUseAppConnection(effectiveConfig) &&
        (await registry.isAppServerConfig(serverName, effectiveConfig));
      const existingAppConnection = useAppConnection
        ? await this.appConnections?.get(serverName)
        : null;
      if (existingAppConnection != null) {
        return {
          tools: await MCPServerInspector.getToolFunctions(serverName, existingAppConnection),
        };
      }

      const userConnections = this.getUserConnections(userId);
      if (!userConnections || userConnections.size === 0) {
        return { tools: null };
      }
      if (!userConnections.has(serverName)) {
        return { tools: null };
      }

      const connection = userConnections.get(serverName)!;
      if (effectiveConfig == null) {
        await this.disconnectUserConnection(userId, serverName);
        return { tools: null };
      }
      const connectionConfigGeneration = this.getToolConfigGeneration(connection);
      const effectiveConfigGeneration = getMCPAppToolsPublicationGeneration(effectiveConfig);
      if (
        connectionConfigGeneration != null &&
        effectiveConfigGeneration != null &&
        connectionConfigGeneration !== effectiveConfigGeneration
      ) {
        await this.disconnectUserConnection(userId, serverName);
        return { tools: null };
      }
      const publicationGeneration = this.getToolPublicationGeneration(connection);
      const currentGeneration = await getMCPToolsChangedGeneration({ userId, serverName });
      if (
        publicationGeneration != null &&
        currentGeneration != null &&
        publicationGeneration !== currentGeneration
      ) {
        await this.disconnectUserConnection(userId, serverName);
        return { tools: null };
      }
      const tools = await MCPServerInspector.getToolFunctions(serverName, connection);
      const generationAfterFetch = await getMCPToolsChangedGeneration({ userId, serverName });
      if (
        publicationGeneration != null &&
        generationAfterFetch != null &&
        publicationGeneration !== generationAfterFetch
      ) {
        await this.disconnectUserConnection(userId, serverName);
        return { tools: null };
      }
      return {
        tools,
        publicationGeneration,
      };
    } catch (error) {
      logger.warn(
        `[getServerToolFunctions] Error getting tool functions for server ${serverName}`,
        error,
      );
      return { tools: null };
    }
  }

  /** Returns all available tool functions from all connections available to user. */
  public async getServerToolFunctions(
    userId: string,
    serverName: string,
  ): Promise<t.LCAvailableTools | null> {
    return (await this.getServerToolFunctionsSnapshot(userId, serverName)).tools;
  }

  /**
   * Get instructions for MCP servers
   * @param serverNames Optional array of server names. If not provided or empty, returns all servers.
   * @returns Object mapping server names to their instructions
   */
  private async getInstructions(
    serverNames?: string[],
    configServers?: Record<string, t.ParsedServerConfig>,
  ): Promise<Record<string, string>> {
    const instructions: Record<string, string> = {};
    const configs = await MCPServersRegistry.getInstance().getAllServerConfigs(
      undefined,
      configServers,
    );
    for (const [serverName, config] of Object.entries(configs)) {
      if (config.serverInstructions != null) {
        instructions[serverName] = config.serverInstructions as string;
      }
    }
    if (!serverNames) return instructions;
    return pick(instructions, serverNames);
  }

  /**
   * Format MCP server instructions for injection into context
   * @param serverNames Optional array of server names to include. If not provided, includes all servers.
   * @returns Formatted instructions string ready for context injection
   */
  public async formatInstructionsForContext(
    serverNames?: string[],
    configServers?: Record<string, t.ParsedServerConfig>,
  ): Promise<string> {
    const instructionsToInclude = await this.getInstructions(serverNames, configServers);

    if (Object.keys(instructionsToInclude).length === 0) {
      return '';
    }

    // Format instructions for context injection
    const formattedInstructions = Object.entries(instructionsToInclude)
      .map(([serverName, instructions]) => {
        return `## ${serverName} MCP Server Instructions

${instructions}`;
      })
      .join('\n\n');

    return `# MCP Server Instructions

The following MCP servers are available with their specific instructions:

${formattedInstructions}

Please follow these instructions when using tools from the respective MCP servers.`;
  }

  public clearResourceUriCache(serverName?: string, userId?: string): void {
    if (serverName && userId != null) {
      const cacheKey = `${serverName}:${userId}`;
      this.resourceUriCache.delete(cacheKey);
      this.appHiddenToolCache.delete(cacheKey);
      this.knownToolNamesCache.delete(cacheKey);
      this.toolCacheConnStamp.delete(cacheKey);
      this.advertisedResourceCache.delete(cacheKey);
      this.advertisedResourceConnStamp.delete(cacheKey);
      return;
    }
    if (serverName) {
      for (const key of this.resourceUriCache.keys()) {
        if (key === serverName || key.startsWith(`${serverName}:`)) {
          this.resourceUriCache.delete(key);
          this.appHiddenToolCache.delete(key);
          this.knownToolNamesCache.delete(key);
          this.toolCacheConnStamp.delete(key);
          this.advertisedResourceCache.delete(key);
          this.advertisedResourceConnStamp.delete(key);
        }
      }
    } else {
      this.resourceUriCache.clear();
      this.appHiddenToolCache.clear();
      this.knownToolNamesCache.clear();
      this.toolCacheConnStamp.clear();
      this.advertisedResourceCache.clear();
      this.advertisedResourceConnStamp.clear();
    }
  }

  /**
   * App-level connections can be recreated when a server config changes, so cached tool metadata
   * is only valid while it was built from the current connection instance.
   */
  private connStamp(connection: MCPConnection): string {
    return `${connection.createdAt}:${connection.toolListVersion}`;
  }

  /**
   * Freshness stamp keyed on the connection instance and the resources/list_changed counter, so
   * removed or added server resources re-authorize without waiting for a reconnect.
   */
  private resourceConnStamp(connection: MCPConnection): string {
    return `${connection.createdAt}:${connection.resourceListVersion}`;
  }

  private isToolCacheFresh(cacheKey: string, connection: MCPConnection): boolean {
    return (
      this.knownToolNamesCache.has(cacheKey) &&
      this.toolCacheConnStamp.get(cacheKey) === this.connStamp(connection)
    );
  }

  protected removeUserConnection(userId: string, serverName: string): void {
    this.clearResourceUriCache(serverName, userId);
    super.removeUserConnection(userId, serverName);
  }

  private async buildToolCaches(connection: MCPConnection): Promise<{
    serverMap: Map<
      string,
      { uri: string; csp?: UIResource['csp']; permissions?: UIResource['permissions'] }
    >;
    appHidden: Set<string>;
    knownNames: Set<string>;
    complete: boolean;
  }> {
    const { tools, complete } = await connection.fetchToolsSnapshot();
    const serverMap = new Map<
      string,
      { uri: string; csp?: UIResource['csp']; permissions?: UIResource['permissions'] }
    >();
    const appHidden = new Set<string>();
    const knownNames = new Set<string>();
    for (const tool of tools) {
      knownNames.add(tool.name);
      if (isToolHiddenFromApp(tool)) {
        appHidden.add(tool.name);
      }
      // A malformed `_meta.ui.resourceUri` on one tool only disables that tool's UI metadata,
      // never aborting discovery for the whole server.
      try {
        const uri = getToolUiResourceUri(tool);
        if (uri) {
          const meta = tool._meta as
            | { ui?: { csp?: UIResource['csp']; permissions?: UIResource['permissions'] } }
            | undefined;
          serverMap.set(tool.name, { uri, csp: meta?.ui?.csp, permissions: meta?.ui?.permissions });
        }
      } catch (error) {
        logger.warn(`[MCP] Ignoring invalid UI resource metadata on tool "${tool.name}":`, error);
      }
    }
    return { serverMap, appHidden, knownNames, complete };
  }

  private async populateToolCaches(connection: MCPConnection, cacheKey: string): Promise<void> {
    const { serverMap, appHidden, knownNames, complete } = await this.buildToolCaches(connection);
    // These caches authorize app tool calls and tool-declared UI resource reads, so a page missing
    // from a partial `tools/list` is a false denial rather than a missing feature. An incomplete
    // snapshot (and an empty one, which a transient failure and a genuinely tool-less server both
    // produce) is left unpublished so the next call re-fetches instead of denying until reconnect.
    // A snapshot truncated by a tools/list budget cap reports complete and is cached, for the same
    // reason the advertisement snapshot caches its cap-truncated form: it is reproducible, so
    // re-fetching it on every call pays the full listing cost without widening the result.
    if (!complete || knownNames.size === 0) {
      return;
    }
    this.resourceUriCache.set(cacheKey, serverMap);
    this.appHiddenToolCache.set(cacheKey, appHidden);
    this.knownToolNamesCache.set(cacheKey, knownNames);
    this.toolCacheConnStamp.set(cacheKey, this.connStamp(connection));
  }

  private async getResourceMeta(
    connection: MCPConnection,
    serverName: string,
    toolName: string,
    userId?: string,
    requestScoped = false,
  ): Promise<
    { uri: string; csp?: UIResource['csp']; permissions?: UIResource['permissions'] } | undefined
  > {
    // Request-scoped servers may expose different tool metadata per request, so their
    // resourceUri/visibility must not be reused from the serverName:userId cache.
    if (requestScoped) {
      const { serverMap } = await this.buildToolCaches(connection);
      return serverMap.get(toolName);
    }
    const cacheKey = `${serverName}:${userId ?? ''}`;
    if (!this.isToolCacheFresh(cacheKey, connection)) {
      await this.populateToolCaches(connection, cacheKey);
    }
    return this.resourceUriCache.get(cacheKey)?.get(toolName);
  }

  /**
   * Calls a tool on an MCP server, using either a user-specific connection
   * (if userId is provided) or an app-level connection. Updates the last activity timestamp
   * for user-specific connections upon successful call initiation.
   *
   * @param graphTokenResolver - Optional function to resolve Graph API tokens via OBO flow.
   *   When provided and the server config contains `{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}` placeholders,
   *   they will be resolved to actual Graph API tokens before the tool call.
   */
  async callTool({
    user,
    serverName,
    serverConfig: providedConfig,
    toolName,
    provider,
    toolArguments,
    options,
    tokenMethods,
    requestBody,
    requestScopedConnections,
    flowManager,
    oauthStart,
    oauthEnd,
    customUserVars,
    graphTokenResolver,
    oboTokenResolver,
    oboTrustChecker,
  }: {
    user?: IUser;
    serverName: string;
    /** Pre-resolved config from tool creation context — avoids readThrough TTL and cross-tenant issues */
    serverConfig?: t.ParsedServerConfig;
    toolName: string;
    provider: t.Provider;
    toolArguments?: Record<string, unknown>;
    options?: RequestOptions;
    requestBody?: RequestBody;
    requestScopedConnections?: t.RequestScopedMCPConnectionStore;
    tokenMethods?: TokenMethods;
    customUserVars?: Record<string, string>;
    flowManager: FlowStateManager<MCPOAuthTokens | null>;
    oauthStart?: t.OAuthStartHandler;
    oauthEnd?: () => Promise<void>;
    graphTokenResolver?: GraphTokenResolver;
    oboTokenResolver?: OboTokenResolver;
    oboTrustChecker?: OboTrustChecker;
  }): Promise<t.FormattedToolResponse> {
    /** User-specific connection */
    let connection: MCPConnection | undefined;
    let cleanupRequestOAuthHandler: (() => void) | undefined;
    let disconnectAfterCall = false;
    const userId = user?.id;
    const logPrefix = userId ? `[MCP][User: ${userId}][${serverName}]` : `[MCP][${serverName}]`;

    try {
      connection = await this.getConnection({
        serverName,
        user,
        flowManager,
        tokenMethods,
        oauthStart,
        oauthEnd,
        oboTokenResolver,
        oboTrustChecker,
        graphTokenResolver,
        signal: options?.signal,
        customUserVars,
        requestBody,
        requestScopedConnections,
        serverConfig: providedConfig,
      });

      if (!(await connection.isConnected())) {
        /** May happen if getUserConnection failed silently or app connection dropped */
        throw new McpError(
          ErrorCode.InternalError, // Use InternalError for connection issues
          `${logPrefix} Connection is not active. Cannot execute tool ${toolName}.`,
        );
      }

      const registry = MCPServersRegistry.getInstance();
      const rawConfig = providedConfig ?? (await registry.getServerConfig(serverName, userId));
      if (!rawConfig) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `${logPrefix} Configuration for server "${serverName}" not found.`,
        );
      }
      const isDbSourced = isUserSourced(rawConfig);
      const ephemeralConnection = !!userId && requiresEphemeralUserConnection(rawConfig);
      disconnectAfterCall = ephemeralConnection && !requestScopedConnections;

      /**
       * Pre-process Graph token placeholders (async) before the synchronous processMCPEnv pass.
       * Plugin-sourced configs are excluded for the same reason processMCPEnv excludes them:
       * a placeholder a plugin authored must never resolve against the user's Graph token.
       */
      const graphProcessedConfig =
        isDbSourced || isPluginSourced(rawConfig)
          ? (rawConfig as t.MCPOptions)
          : await preProcessGraphTokens(rawConfig as t.MCPOptions, {
              user,
              graphTokenResolver,
              scopes: process.env.GRAPH_API_SCOPES,
            });
      const currentOptions = processMCPEnv({
        user,
        body: requestBody,
        dbSourced: isDbSourced,
        options: graphProcessedConfig,
        customUserVars,
      });

      const resolvedHeaders: Record<string, string> =
        'headers' in currentOptions ? { ...(currentOptions.headers || {}) } : {};

      /** Refresh OBO token on each tool call to ensure it's current */
      const oboConfig = rawConfig.obo;
      if (oboConfig && oboTokenResolver && user) {
        const oboTrusted = oboTrustChecker
          ? await oboTrustChecker({
              source: rawConfig.source,
              author: rawConfig.author,
              dbId: rawConfig.dbId,
            })
          : true;
        if (!oboTrusted) {
          logger.warn(
            `${logPrefix} OBO config not trusted (author lacks ${PermissionTypes.MCP_SERVERS}.${Permissions.CONFIGURE_OBO}); refusing to mint a downstream token`,
          );
          throw new McpError(
            ErrorCode.InternalError,
            `${logPrefix} OBO is not permitted for server "${serverName}". The user who configured it no longer has permission to use OBO.`,
          );
        }
        let oboTokens: MCPOAuthTokens;
        try {
          oboTokens = await resolveOboToken(user, oboConfig, oboTokenResolver);
        } catch (error) {
          if (error instanceof OboTokenResolutionError) {
            throw new McpError(
              ErrorCode.InternalError,
              createOboToolCallErrorMessage(logPrefix, toolName, error),
            );
          }
          throw error;
        }

        if (!oboTokens.access_token) {
          throw new McpError(
            ErrorCode.InternalError,
            `${logPrefix} OBO token refresh failed. Cannot execute tool ${toolName}. Re-authenticate the user and retry.`,
          );
        }
        resolvedHeaders['Authorization'] = `Bearer ${oboTokens.access_token}`;
      }
      if (userId && user && oauthStart && flowManager && isOAuthServer(currentOptions)) {
        const { allowedDomains, allowedAddresses, useSSRFProtection } =
          await registry.resolveAllowlists({ userId, role: user?.role });
        cleanupRequestOAuthHandler = MCPConnectionFactory.attachRequestOAuthHandler(
          {
            serverName,
            serverConfig: currentOptions,
            dbSourced: isDbSourced,
            skipEnvProcessing: true,
            useSSRFProtection,
            allowedDomains,
            allowedAddresses,
          },
          {
            useOAuth: true,
            user,
            flowManager,
            tokenMethods,
            signal: options?.signal,
            oauthStart,
            oauthEnd,
            customUserVars,
            requestBody,
          },
          connection,
        );
      }

      connection.setRequestHeaders(resolvedHeaders);

      // Deliberately `request` rather than `client.callTool`: the typed wrapper also enforces the
      // tool's `outputSchema` and rejects `execution.taskSupport: required` tools, which would turn
      // a server-side schema mismatch into a host-side tool failure.
      const result = await connection.client.request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: toolArguments,
          },
        },
        CallToolResultSchema,
        {
          timeout: connection.timeout,
          resetTimeoutOnProgress: true,
          ...options,
        },
      );
      const hasPersistentUserConnections =
        !!userId && (this.userConnections.get(userId)?.size ?? 0) > 0;
      if (!ephemeralConnection && hasPersistentUserConnections) {
        await this.updateUserLastActivity(userId);
      }
      this.checkIdleConnections();
      // The app routes (getAppConnection) reject OBO, Graph-token, and runtime body-placeholder
      // configs, so do not advertise an MCP App for them: the iframe could never fetch its HTML or
      // run follow-up calls. Such tools still render their content, just without the app bridge.
      const appCompatible =
        !rawConfig ||
        (!rawConfig.obo &&
          !(!isDbSourced && mcpOptionsContainGraphTokenPlaceholder(rawConfig as t.MCPOptions)) &&
          getMissingRuntimeBodyPlaceholderFields(rawConfig).length === 0);

      let resourceMeta:
        | { uri: string; csp?: UIResource['csp']; permissions?: UIResource['permissions'] }
        | undefined;
      if (appCompatible) {
        try {
          resourceMeta = await this.getResourceMeta(
            connection,
            serverName,
            toolName,
            userId,
            requiresEphemeralUserConnection(rawConfig),
          );
        } catch {
          /* empty */
        }
      }

      // The apps toggle must gate both the tool-declared app and any ui:// resource embedded in the
      // result (either renders an iframe that breaks once the gated app endpoints reject follow-up
      // calls). Resolved lazily, only when a UI resource is in play, so plain tool calls skip the
      // per-request lookup.
      let enableApps = true;
      if (resourceMeta || resultHasRenderableUiResource(result as t.MCPToolCallResponse)) {
        ({ appsEnabled: enableApps } = await registry.resolveAllowlists({
          userId,
          role: user?.role,
        }));
        if (!enableApps) {
          resourceMeta = undefined;
        } else if (resourceMeta) {
          logger.debug(`[MCP][${serverName}][${toolName}] Found resourceUri: ${resourceMeta.uri}`);
        }
      }

      return formatToolContent(
        result as t.MCPToolCallResponse,
        provider,
        appCompatible
          ? {
              serverName,
              toolName,
              resourceUri: resourceMeta?.uri,
              csp: resourceMeta?.csp,
              permissions: resourceMeta?.permissions,
              toolArgs: toolArguments,
              enableApps,
            }
          : { enableApps },
      );
    } catch (error) {
      // Log with context and re-throw or handle as needed
      logger.error(`${logPrefix}[${toolName}] Tool call failed`, error);
      // Rethrowing allows the caller (createMCPTool) to handle the final user message
      throw error;
    } finally {
      cleanupRequestOAuthHandler?.();
      // Ephemeral connections are never stored in userConnections, so disconnecting
      // is the only cleanup needed; removing the map entry here could orphan a
      // still-connected cached connection from before a config change.
      if (disconnectAfterCall && connection) {
        try {
          await connection.disconnect();
        } catch (disconnectError) {
          logger.warn(`${logPrefix}[${toolName}] Failed to disconnect ephemeral connection`, {
            error: disconnectError,
          });
        }
      }
    }
  }

  /**
   * Resolves the same registry-backed config the original tool call used and hands it to
   * getConnection so config-source servers resolve, then refreshes headers for non-DB-sourced
   * servers. Iframe follow-up requests arrive without the original requestBody, so configs that
   * still need runtime body placeholders are rejected rather than connected with unresolved values.
   */
  private async getAppConnection({
    serverName,
    userId,
    user,
    configServers,
    customUserVars,
    flowManager,
    tokenMethods,
  }: {
    serverName: string;
    userId: string;
    user?: IUser;
    configServers?: Record<string, t.ParsedServerConfig>;
    customUserVars?: Record<string, string>;
    flowManager?: FlowStateManager<MCPOAuthTokens | null>;
    tokenMethods?: TokenMethods;
  }): Promise<MCPConnection> {
    const logPrefix = `[MCP][User: ${userId}][${serverName}]`;
    // Resolved through the role-aware path (as discovery does) rather than the single-server lookup,
    // whose ACL check is user-only: a server or agent shared to the user's role would otherwise look
    // inaccessible here and the app's follow-up reads and tool calls would be rejected. Precedence
    // matches getServerConfig by contract.
    const allConfigs = await MCPServersRegistry.getInstance().getAllServerConfigs(
      userId,
      configServers,
      user?.role,
    );
    const rawConfig = allConfigs[serverName];
    const isDbSourced = rawConfig ? isUserSourced(rawConfig) : false;
    if (rawConfig) {
      if (rawConfig.obo) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `${logPrefix} Server "${serverName}" requires per-call OBO token resolution which is not supported for app requests.`,
        );
      }
      if (!isDbSourced && mcpOptionsContainGraphTokenPlaceholder(rawConfig as t.MCPOptions)) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `${logPrefix} Server "${serverName}" requires Graph API token resolution which is not supported for app requests.`,
        );
      }
      const missingBodyFields = getMissingRuntimeBodyPlaceholderFields(rawConfig);
      if (missingBodyFields.length > 0) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `${logPrefix} Server "${serverName}" requires request body field(s) (${missingBodyFields.join(', ')}) that are not available for app requests.`,
        );
      }
    }

    const connection = await this.getConnection({
      serverName,
      user,
      serverConfig: rawConfig ?? undefined,
      customUserVars,
      flowManager,
      tokenMethods,
    });

    // Refresh headers when the config can be fully resolved: env-var-only configs always, and
    // customUserVar configs only when the route supplied those vars. Without them, re-processing
    // would overwrite the original connection's resolved auth headers with bare placeholders, so
    // those are left to the existing/cold connection that was built with customUserVars.
    const hasUserVars = !!customUserVars && Object.keys(customUserVars).length > 0;
    if (rawConfig && !isDbSourced && (!hasCustomUserVars(rawConfig) || hasUserVars)) {
      const currentOptions = processMCPEnv({
        user,
        dbSourced: false,
        options: rawConfig as t.MCPOptions,
        customUserVars,
      });
      const resolvedHeaders: Record<string, string> =
        'headers' in currentOptions ? { ...(currentOptions.headers || {}) } : {};
      connection.setRequestHeaders(resolvedHeaders);
    }

    return connection;
  }

  async readResource({
    userId,
    serverName,
    uri,
    user,
    configServers,
    customUserVars,
    flowManager,
    tokenMethods,
  }: {
    userId: string;
    serverName: string;
    uri: string;
    user?: import('@librechat/data-schemas').IUser;
    configServers?: Record<string, t.ParsedServerConfig>;
    customUserVars?: Record<string, string>;
    flowManager?: FlowStateManager<MCPOAuthTokens | null>;
    tokenMethods?: TokenMethods;
  }): Promise<unknown> {
    const logPrefix = `[MCP][User: ${userId}][${serverName}]`;
    if (userId && user) this.updateUserLastActivity(userId);
    const connection = await this.getAppConnection({
      serverName,
      userId,
      user,
      configServers,
      customUserVars,
      flowManager,
      tokenMethods,
    });

    if (!(await connection.isConnected())) {
      throw new McpError(
        ErrorCode.InternalError,
        `${logPrefix} Connection is not active. Cannot read resource.`,
      );
    }

    await this.assertResourceReadable(connection, `${serverName}:${userId}`, uri, logPrefix);

    return connection.client.readResource({ uri }, { timeout: connection.timeout });
  }

  /**
   * True when any tool on this connection declares `uri` as its UI resource. Connection-wide rather
   * than per-tool because apps.mdx scopes an app's privileges to the same server connection, and
   * needed in addition to the advertised set because servers MAY omit UI-only resources from
   * `resources/list`. A `tools/list` failure denies (and stays retryable: `populateToolCaches` never
   * caches an incomplete or empty tool set, so the next read re-fetches).
   */
  private async isToolDeclaredUiResource(
    connection: MCPConnection,
    cacheKey: string,
    uri: string,
  ): Promise<boolean> {
    try {
      if (!this.isToolCacheFresh(cacheKey, connection)) {
        await this.populateToolCaches(connection, cacheKey);
      }
    } catch (error) {
      logger.warn(
        `[MCP][${cacheKey}] Could not list tools to authorize UI resource "${uri}"; denying.`,
        error,
      );
      return false;
    }
    const declared = this.resourceUriCache.get(cacheKey);
    if (!declared) {
      return false;
    }
    for (const meta of declared.values()) {
      if (meta.uri === uri) {
        return true;
      }
    }
    return false;
  }

  /**
   * Authorizes an app-driven `resources/read`. The URI must either be declared as a tool's UI
   * resource on this connection or be one the server actually advertises (an exact `resources/list`
   * entry or a `resources/templates/list` match), so a sandboxed app cannot exfiltrate unrelated
   * resources the host connection can otherwise reach. Fails closed when neither is available.
   */
  private async assertResourceReadable(
    connection: MCPConnection,
    cacheKey: string,
    uri: string,
    logPrefix: string,
  ): Promise<void> {
    // Check order is load-bearing: tool-declared, then the exact advertised URI, then the
    // canonicalized template match. Canonicalization must stay below the exact check, or an
    // advertised URI carrying a bare `%` (`db://100%`) fails to decode and becomes unreadable.
    if (
      uri.startsWith('ui://') &&
      (await this.isToolDeclaredUiResource(connection, cacheKey, uri))
    ) {
      return;
    }
    let advertised: { uris: Set<string>; templates: RE2JS[]; complete: boolean };
    try {
      advertised = await this.getAdvertisedResources(connection, cacheKey);
    } catch (error) {
      logger.warn(
        `${logPrefix} Could not list advertised resources to authorize read of "${uri}"; denying.`,
        error,
      );
      throw new McpError(
        ErrorCode.InvalidRequest,
        `${logPrefix} Resource "${uri}" is not permitted.`,
      );
    }
    if (advertised.uris.has(uri)) {
      return;
    }
    // Match templates in canonical (fully percent-decoded) space, never raw bytes, so an encoded
    // traversal like `%2e%2e%2f` cannot slip past a template guard.
    const canonicalUri = MCPManager.canonicalizeUri(uri);
    if (
      canonicalUri != null &&
      advertised.templates.some((pattern) => pattern.matches(canonicalUri))
    ) {
      return;
    }
    // A truncated snapshot must not deny with a claim the server never made.
    const truncated = advertised.complete
      ? ''
      : ' The advertised resource list could not be fully enumerated.';
    throw new McpError(
      ErrorCode.InvalidRequest,
      `${logPrefix} Resource "${uri}" is not advertised by the server and cannot be read by an app.${truncated}`,
    );
  }

  /**
   * Walks one cursor-paginated advertisement list. Reports `truncated` when the snapshot it produced
   * stopped at the page or entry cap, so a denial can report that rather than imply the server does
   * not advertise the resource, and a request failure propagates so it can be told apart from a cap.
   * An empty-string `nextCursor` ends pagination: treating it as a next page re-requests page one
   * until the cap and truncates the snapshot instead.
   */
  private static async collectAdvertisedPages<T>(
    fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>,
    collect: (item: T) => void,
    count: () => number,
  ): Promise<'complete' | 'truncated'> {
    let cursor: string | undefined;
    for (let page = 0; page < MCPManager.RESOURCE_LIST_MAX_PAGES; page++) {
      const { items, nextCursor } = await fetchPage(cursor);
      for (const item of items) {
        if (count() >= MCPManager.RESOURCE_LIST_MAX_ENTRIES) {
          return 'truncated';
        }
        collect(item);
      }
      if (!nextCursor) {
        return 'complete';
      }
      cursor = nextCursor;
    }
    return 'truncated';
  }

  /**
   * A server that does not implement one of the advertisement methods answers the same way every
   * time, so its empty list is its actual advertisement rather than a failure to enumerate.
   */
  private static isUnimplementedMethod(error: unknown): boolean {
    return error instanceof McpError && error.code === ErrorCode.MethodNotFound;
  }

  /**
   * Snapshots the resource URIs and URI templates a server advertises. Caching is deliberate per
   * outcome: a fully walked or cap-truncated snapshot is cached (both are reproducible, and
   * re-walking up to `RESOURCE_LIST_MAX_ENTRIES` entries on every app read is the cost this cache
   * exists to avoid), while a request failure is not cached at all, so a transient `resources/list`
   * error denies only the read that saw it instead of every read for the connection's lifetime.
   */
  private async getAdvertisedResources(
    connection: MCPConnection,
    cacheKey: string,
  ): Promise<{ uris: Set<string>; templates: RE2JS[]; complete: boolean }> {
    const cached = this.advertisedResourceCache.get(cacheKey);
    if (
      cached &&
      this.advertisedResourceConnStamp.get(cacheKey) === this.resourceConnStamp(connection)
    ) {
      return cached;
    }

    const uris = new Set<string>();
    const templates: RE2JS[] = [];
    let truncated = false;
    let failed = false;
    // The handshake capabilities say whether the server has resources at all, so a server declaring
    // none advertises an empty (and complete) set instead of being probed. Capabilities are unknown
    // only before initialize resolves, where asking is harmless: a failed call still denies.
    const capabilities = connection.client.getServerCapabilities?.();
    if (capabilities == null || capabilities.resources != null) {
      // A template-only server may not implement resources/list; treat that as an empty concrete
      // list so advertised templates below are still collected and can authorize reads.
      try {
        const outcome = await MCPManager.collectAdvertisedPages(
          async (cursor) => {
            const result: ListResourcesResult = await connection.client.listResources(
              cursor != null ? { cursor } : {},
              { timeout: connection.timeout },
            );
            return { items: result.resources, nextCursor: result.nextCursor };
          },
          (resource) => uris.add(resource.uri),
          () => uris.size,
        );
        truncated = outcome === 'truncated';
      } catch (error) {
        failed = !MCPManager.isUnimplementedMethod(error);
        logger.debug(`[MCP][${cacheKey}] resources/list unavailable; using templates only.`, error);
      }

      try {
        const outcome = await MCPManager.collectAdvertisedPages(
          async (cursor) => {
            const result: ListResourceTemplatesResult =
              await connection.client.listResourceTemplates(cursor != null ? { cursor } : {}, {
                timeout: connection.timeout,
              });
            return { items: result.resourceTemplates, nextCursor: result.nextCursor };
          },
          (template) => {
            const pattern = MCPManager.compileUriTemplate(template.uriTemplate);
            if (pattern) {
              templates.push(pattern);
            }
          },
          () => templates.length,
        );
        truncated = truncated || outcome === 'truncated';
      } catch (error) {
        failed = failed || !MCPManager.isUnimplementedMethod(error);
        logger.debug(
          `[MCP][${cacheKey}] resources/templates/list unavailable; skipping templates.`,
          error,
        );
      }
    }

    const entry = { uris, templates, complete: !truncated && !failed };
    if (failed) {
      logger.warn(
        `[MCP][${cacheKey}] Advertised resources could not be enumerated; denying this read and re-listing on the next one.`,
      );
      return entry;
    }
    if (truncated) {
      logger.warn(
        `[MCP][${cacheKey}] Advertised resource snapshot is incomplete; resources outside the snapshot will be denied for this connection.`,
      );
    }
    this.advertisedResourceCache.set(cacheKey, entry);
    this.advertisedResourceConnStamp.set(cacheKey, this.resourceConnStamp(connection));
    return entry;
  }

  /**
   * Fully percent-decodes a URI to the canonical form a server resolves. Returns null when it
   * cannot be decoded, does not stabilize within the decode cap, or contains a relative (`.`/`..`)
   * segment, so neither deeply encoded traversal nor relative segments can satisfy a template
   * guard. Failing closed on the cap matters because a server that decodes until stable would
   * otherwise receive a traversal this guard never saw in decoded form.
   */
  private static canonicalizeUri(uri: string): string | null {
    let current = uri;
    let stabilized = false;
    for (let depth = 0; depth < 5; depth++) {
      let decoded: string;
      try {
        decoded = decodeURIComponent(current);
      } catch {
        return null;
      }
      if (decoded === current) {
        stabilized = true;
        break;
      }
      current = decoded;
    }
    if (!stabilized) {
      return null;
    }
    if (current.split(/[/\\]/).some((segment) => segment === '.' || segment === '..')) {
      return null;
    }
    return current;
  }

  /**
   * Converts an RFC 6570 resource URI template into an anchored matcher. Simple expansions match a
   * single path segment; reserved/operator expansions (`{+x}`, `{#x}`, `{/x}`, ...) may span `/`.
   *
   * Compiled with RE2 rather than the native engine because both halves are attacker-supplied (a
   * server advertises the template, the sandboxed app supplies the URI) and adjacent expressions
   * produce adjacent unbounded classes by construction, so no character-class tightening can make
   * `{a}{b}{c}...` safe on a backtracking engine (measured: tens of seconds on one request).
   *
   * The SDK's `UriTemplate.match()` is deliberately not used in its place: it admits `&` inside a
   * simple value (so `?q={q}` authorizes `?q=foo&admin=true`), maps `+`/`#` to an unbounded class,
   * implements no `;` operator, and builds its `RegExp` inside `match()` where no linear-time engine
   * can be substituted.
   */
  private static compileUriTemplate(template: string): RE2JS | null {
    try {
      let pattern = '';
      for (let i = 0; i < template.length; ) {
        const char = template[i];
        if (char !== '{') {
          pattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          i += 1;
          continue;
        }
        const end = template.indexOf('}', i);
        if (end === -1) {
          pattern += template.slice(i).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          break;
        }
        // Each RFC 6570 operator expands to a bounded shape. Never emit an unrestricted `.+`:
        // because this regex is the allow-list for app-driven resources/read, a query/fragment
        // template must not authorize unrelated reads or path traversal.
        const expr = template.slice(i + 1, end);
        // Reserved operators have no defined expansion, so nothing they could authorize is knowable.
        if (MCPManager.RESERVED_TEMPLATE_OPERATOR.test(expr)) {
          return null;
        }
        const op = expr[0] ?? '';
        // Variable names declared in this expansion (operator + `:prefix`/`*explode` modifiers
        // stripped), used to constrain query expansions to their declared keys rather than an
        // open query string.
        const varSpecs = expr
          .replace(/^[+#./;?&]/, '')
          .split(',')
          .map((spec) => spec.trim())
          .filter(Boolean);
        const keys = varSpecs
          .map((spec) => spec.split(/[:*]/)[0].trim())
          .filter(Boolean)
          .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|');
        // No declared name means no value this expression could recover, so `{?}`, `{&}`, `{}` and
        // `{*}` authorize nothing rather than falling back to an open query string.
        if (!keys) {
          return null;
        }
        if (varSpecs.some((spec) => spec.includes(':'))) {
          const prefixed = MCPManager.compilePrefixedExpansion(op, varSpecs);
          if (prefixed == null) {
            return null;
          }
          pattern += prefixed;
          i = end + 1;
          continue;
        }
        // RFC 6570 3.2.5/3.2.6: each defined variable contributes exactly one prefixed component,
        // so a non-exploded expression can never expand past its declared variable count.
        const exploded = varSpecs.some((spec) => spec.endsWith('*'));
        const quantified = exploded || varSpecs.length > 1;
        const bounded = (unit: string) => {
          if (exploded) {
            return `(?:${unit})+`;
          }
          return varSpecs.length > 1 ? `(?:${unit}){1,${varSpecs.length}}` : unit;
        };
        switch (op) {
          case '+': // reserved expansion: may legitimately include "/"
            pattern += '[^?#]+';
            break;
          case '#': // fragment
            pattern += '#[^\\s]*';
            break;
          case '/': // path segments
            pattern += bounded('/[^/?#]+');
            break;
          case '.': // label(s): the repeated unit must exclude its own delimiter, or one repetition
            // swallows the rest; a single unquantified label keeps the wider class.
            pattern += quantified ? bounded('\\.[^/?#.]+') : '\\.[^/?#]+';
            break;
          case ';': // path-style params: pinned to the declared names and bounded by their count,
            // with a value class excluding `;` so one value cannot swallow `;admin=true`.
            pattern += bounded(`;(?:${keys})(?:=[^/?#;&]*)?`);
            break;
          case '?': // query: only the declared parameter names, in any order
            pattern += `\\?(?:${keys})=[^#&]*(?:&(?:${keys})=[^#&]*)*`;
            break;
          case '&': // query continuation: only the declared parameter names
            pattern += `(?:&(?:${keys})=[^#&]*)+`;
            break;
          default: // simple expansion: a single value. RFC 6570 percent-encodes reserved chars,
            // so a real value never contains a raw `&` or `=`; excluding them stops a query value
            // like `q={q}` from matching `q=foo&admin=true` and authorizing an undeclared param.
            pattern += '[^/?#&=]+';
        }
        i = end + 1;
      }
      // A pattern RE2 refuses to compile (an oversized varSpec list, for instance) throws
      // RE2JSSyntaxException here and fails closed as a null matcher.
      return RE2JS.compile(`^${pattern}$`);
    } catch {
      return null;
    }
  }

  /**
   * RFC 6570 §2.4: a varspec carries at most one modifier, `:max-length` (1 to 9999) or `*`. Anything
   * else (`{id:3*}`, `{id:0}`, `{id:abc}`) is not a valid varspec, so no expansion of it is knowable.
   */
  private static parseVarSpec(spec: string): UriTemplateVarSpec | null {
    const explode = spec.endsWith('*');
    const body = explode ? spec.slice(0, -1) : spec;
    const colon = body.indexOf(':');
    if (colon === -1) {
      const name = body.trim();
      return name ? { name, explode } : null;
    }
    if (explode) {
      return null;
    }
    const name = body.slice(0, colon).trim();
    const maxLength = body.slice(colon + 1).trim();
    if (!name || !/^[1-9][0-9]{0,3}$/.test(maxLength)) {
      return null;
    }
    return { name, prefix: Number(maxLength), explode };
  }

  /**
   * Compiles an expansion in which at least one variable carries a `:max-length` prefix. RFC 6570
   * §2.4.1 truncates a prefixed string value to that many characters, and templates are matched
   * against the fully percent-decoded URI, so the limit is a plain character bound on the matched
   * text. Without it, `db://items/{id:3}` authorizes `db://items/admin`.
   *
   * Variables expand in declared order and an undefined one contributes nothing, so what a
   * multi-variable expression can produce is any ordered subsequence of its components. Those are
   * compiled as a chain of optional per-variable units, each with its own bound, rather than one
   * shared quantifier: a shared quantifier would either apply the tightest bound to every position
   * or, as before, none to any. The chain still requires at least one component, keeping the
   * existing denial for a URI that omits the whole expansion.
   *
   * A prefix RE2 cannot express as a repeat count leaves that variable unbounded (its own class
   * still applies), which is the pre-existing behavior and cannot deny a legitimate expansion.
   */
  private static compilePrefixedExpansion(op: string, varSpecs: string[]): string | null {
    // The ordered chain is quadratic in the declared variable count, so a pathological varspec list
    // authorizes nothing instead of being handed to RE2 as a compile-time cost on every read.
    if (varSpecs.length > MCPManager.MAX_PREFIXED_TEMPLATE_VARS) {
      return null;
    }
    const specs: UriTemplateVarSpec[] = [];
    for (const varSpec of varSpecs) {
      const parsed = MCPManager.parseVarSpec(varSpec);
      if (parsed == null) {
        return null;
      }
      specs.push(parsed);
    }

    const bound = (spec: UriTemplateVarSpec, cls: string, min: number): string => {
      if (spec.prefix == null || spec.prefix > MCPManager.MAX_REPEAT_COUNT) {
        return `${cls}${min === 0 ? '*' : '+'}`;
      }
      return `${cls}{${min},${spec.prefix}}`;
    };
    const component = (spec: UriTemplateVarSpec, delimiter: string, cls: string): string => {
      const unit = `${delimiter}${bound(spec, cls, 1)}`;
      return spec.explode ? `(?:${unit})+` : unit;
    };
    const chain = (units: string[]): string => {
      const branches = units.map((unit, index) =>
        units.slice(index + 1).reduce((branch, rest) => `${branch}(?:${rest})?`, `(?:${unit})`),
      );
      return branches.length === 1 ? branches[0] : `(?:${branches.join('|')})`;
    };
    /** Comma-joined operators expand to one run, so their bound is the sum plus the separators. */
    const joined = (cls: string, min: number, literal = ''): string => {
      let total = specs.length - 1;
      for (const spec of specs) {
        if (spec.prefix == null || spec.explode) {
          return `${literal}${cls}${min === 0 ? '*' : '+'}`;
        }
        total += spec.prefix;
      }
      if (total > MCPManager.MAX_REPEAT_COUNT) {
        return `${literal}${cls}${min === 0 ? '*' : '+'}`;
      }
      return `${literal}${cls}{${min},${total}}`;
    };
    const escaped = (spec: UriTemplateVarSpec): string =>
      spec.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const query = (): string =>
      specs.map((spec) => `${escaped(spec)}=${bound(spec, '[^#&]', 0)}`).join('|');

    switch (op) {
      case '+':
        return joined('[^?#]', 1);
      case '#':
        return joined('[^\\s]', 0, '#');
      case '/':
        return chain(specs.map((spec) => component(spec, '/', '[^/?#]')));
      case '.':
        return specs.length === 1 && !specs[0].explode
          ? component(specs[0], '\\.', '[^/?#]')
          : chain(specs.map((spec) => component(spec, '\\.', '[^/?#.]')));
      case ';':
        return chain(
          specs.map((spec) => {
            const unit = `;${escaped(spec)}(?:=${bound(spec, '[^/?#;&]', 0)})?`;
            return spec.explode ? `(?:${unit})+` : unit;
          }),
        );
      case '?':
        return `\\?(?:${query()})(?:&(?:${query()}))*`;
      case '&':
        return `(?:&(?:${query()}))+`;
      default:
        return joined('[^/?#&=]', 1);
    }
  }

  /**
   * Proxies an MCP App resources/list request to the server. Paired with readResource so the
   * advertised serverResources capability is fully backed (resource-browser apps need listing).
   */
  async listResources({
    userId,
    serverName,
    user,
    cursor,
    configServers,
    customUserVars,
    flowManager,
    tokenMethods,
  }: {
    userId: string;
    serverName: string;
    user?: import('@librechat/data-schemas').IUser;
    cursor?: string;
    configServers?: Record<string, t.ParsedServerConfig>;
    customUserVars?: Record<string, string>;
    flowManager?: FlowStateManager<MCPOAuthTokens | null>;
    tokenMethods?: TokenMethods;
  }): Promise<unknown> {
    const logPrefix = `[MCP][User: ${userId}][${serverName}]`;
    if (userId && user) this.updateUserLastActivity(userId);
    const connection = await this.getAppConnection({
      serverName,
      userId,
      user,
      configServers,
      customUserVars,
      flowManager,
      tokenMethods,
    });

    if (!(await connection.isConnected())) {
      throw new McpError(
        ErrorCode.InternalError,
        `${logPrefix} Connection is not active. Cannot list resources.`,
      );
    }

    return connection.client.listResources(cursor != null ? { cursor } : {}, {
      timeout: connection.timeout,
    });
  }

  async listResourceTemplates({
    userId,
    serverName,
    user,
    cursor,
    configServers,
    customUserVars,
    flowManager,
    tokenMethods,
  }: {
    userId: string;
    serverName: string;
    user?: import('@librechat/data-schemas').IUser;
    cursor?: string;
    configServers?: Record<string, t.ParsedServerConfig>;
    customUserVars?: Record<string, string>;
    flowManager?: FlowStateManager<MCPOAuthTokens | null>;
    tokenMethods?: TokenMethods;
  }): Promise<unknown> {
    const logPrefix = `[MCP][User: ${userId}][${serverName}]`;
    if (userId && user) this.updateUserLastActivity(userId);
    const connection = await this.getAppConnection({
      serverName,
      userId,
      user,
      configServers,
      customUserVars,
      flowManager,
      tokenMethods,
    });

    if (!(await connection.isConnected())) {
      throw new McpError(
        ErrorCode.InternalError,
        `${logPrefix} Connection is not active. Cannot list resource templates.`,
      );
    }

    return connection.client.listResourceTemplates(cursor != null ? { cursor } : {}, {
      timeout: connection.timeout,
    });
  }

  /**
   * Proxies a tool call from an MCP App iframe to the MCP server.
   * Unlike callTool, this is a lightweight proxy without provider formatting.
   */
  async appToolCall({
    userId,
    serverName,
    toolName,
    toolArguments,
    user,
    configServers,
    customUserVars,
    flowManager,
    tokenMethods,
  }: {
    userId: string;
    serverName: string;
    toolName: string;
    toolArguments: Record<string, unknown>;
    user?: import('@librechat/data-schemas').IUser;
    configServers?: Record<string, t.ParsedServerConfig>;
    customUserVars?: Record<string, string>;
    flowManager?: FlowStateManager<MCPOAuthTokens | null>;
    tokenMethods?: TokenMethods;
  }): Promise<unknown> {
    const logPrefix = `[MCP][User: ${userId}][${serverName}]`;
    if (userId && user) this.updateUserLastActivity(userId);
    const connection = await this.getAppConnection({
      serverName,
      userId,
      user,
      configServers,
      customUserVars,
      flowManager,
      tokenMethods,
    });

    if (!(await connection.isConnected())) {
      throw new McpError(
        ErrorCode.InternalError,
        `${logPrefix} Connection is not active. Cannot execute app tool call.`,
      );
    }

    const cacheKey = `${serverName}:${userId ?? ''}`;
    if (!this.isToolCacheFresh(cacheKey, connection)) {
      await this.populateToolCaches(connection, cacheKey);
    }
    if (!this.knownToolNamesCache.get(cacheKey)?.has(toolName)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `${logPrefix} Tool "${toolName}" is not available on server "${serverName}".`,
      );
    }

    if (this.appHiddenToolCache.get(cacheKey)?.has(toolName)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `${logPrefix} Tool "${toolName}" is not available to apps (visibility excludes "app").`,
      );
    }

    // Same reason as callTool: the typed wrapper adds outputSchema enforcement this proxy must not
    // impose on an app follow-up call.
    return connection.client.request(
      {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: toolArguments,
        },
      },
      CallToolResultSchema,
      { timeout: connection.timeout, resetTimeoutOnProgress: true },
    );
  }
}
