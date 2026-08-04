import pick from 'lodash/pick';
import { logger } from '@librechat/data-schemas';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import {
  CallToolResultSchema,
  ReadResourceResultSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
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
  hasCustomUserVars,
  isOAuthServer,
  isUserSourced,
  requiresEphemeralUserConnection,
  requiresOAuthMachinery,
  requiresUserScopedConnection,
} from './utils';
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
import { MCPConnection } from './connection';
import { processMCPEnv } from '~/utils/env';

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
    { uris: Set<string>; templates: RegExp[] }
  >();

  private readonly advertisedResourceConnStamp = new Map<string, string>();
  private static readonly RESOURCE_LIST_MAX_PAGES = 20;

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
        const tools = await existingAppConnection.fetchTools();
        return { tools, oauthRequired: false, oauthUrl: null };
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
          await result.connection.disconnect();
        } catch (error) {
          logger.warn(`${logPrefix} [Discovery] Failed to disconnect discovery connection`, error);
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
      if (config.toolFunctions != null) {
        Object.assign(toolFunctions, config.toolFunctions);
      }
    }
    return toolFunctions;
  }

  /** Returns all available tool functions from all connections available to user */
  public async getServerToolFunctions(
    userId: string,
    serverName: string,
  ): Promise<t.LCAvailableTools | null> {
    try {
      //try get the appConnection (if the config is not in the app level anymore any existing connection will disconnect and get will return null)
      const existingAppConnection = await this.appConnections?.get(serverName);
      if (existingAppConnection) {
        return MCPServerInspector.getToolFunctions(serverName, existingAppConnection);
      }

      const userConnections = this.getUserConnections(userId);
      if (!userConnections || userConnections.size === 0) {
        return null;
      }
      if (!userConnections.has(serverName)) {
        return null;
      }

      return MCPServerInspector.getToolFunctions(serverName, userConnections.get(serverName)!);
    } catch (error) {
      logger.warn(
        `[getServerToolFunctions] Error getting tool functions for server ${serverName}`,
        error,
      );
      return null;
    }
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
  }> {
    const tools = await connection.fetchTools();
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
    return { serverMap, appHidden, knownNames };
  }

  private async populateToolCaches(connection: MCPConnection, cacheKey: string): Promise<void> {
    const { serverMap, appHidden, knownNames } = await this.buildToolCaches(connection);
    // fetchTools returns [] both for genuinely tool-less servers and for a transient tools/list
    // failure. Caching an empty list as authoritative would disable MCP Apps until reconnect, so
    // leave the cache unpopulated when empty and re-fetch on the next call.
    if (knownNames.size === 0) {
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

      /** Pre-process Graph token placeholders (async) before the synchronous processMCPEnv pass */
      const graphProcessedConfig = isDbSourced
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
        this.updateUserLastActivity(userId);
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
    const rawConfig = await MCPServersRegistry.getInstance().getServerConfig(
      serverName,
      userId,
      configServers,
    );
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

    const result = await connection.client.request(
      {
        method: 'resources/read',
        params: { uri },
      },
      ReadResourceResultSchema,
      { timeout: connection.timeout },
    );

    return result;
  }

  /**
   * Authorizes an app-driven `resources/read`. App UI resources (`ui://`) are always allowed;
   * any other URI must be one the server actually advertises (an exact `resources/list` entry or
   * a `resources/templates/list` match), so a sandboxed app cannot exfiltrate unrelated resources
   * the host connection can otherwise reach. Fails closed when the advertised set is unavailable.
   */
  private async assertResourceReadable(
    connection: MCPConnection,
    cacheKey: string,
    uri: string,
    logPrefix: string,
  ): Promise<void> {
    if (uri.startsWith('ui://')) {
      return;
    }
    let advertised: { uris: Set<string>; templates: RegExp[] };
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
      advertised.templates.some((pattern) => pattern.test(canonicalUri))
    ) {
      return;
    }
    throw new McpError(
      ErrorCode.InvalidRequest,
      `${logPrefix} Resource "${uri}" is not advertised by the server and cannot be read by an app.`,
    );
  }

  /** Snapshots (and caches per connection) the resource URIs and URI templates a server advertises. */
  private async getAdvertisedResources(
    connection: MCPConnection,
    cacheKey: string,
  ): Promise<{ uris: Set<string>; templates: RegExp[] }> {
    const cached = this.advertisedResourceCache.get(cacheKey);
    if (
      cached &&
      this.advertisedResourceConnStamp.get(cacheKey) === this.resourceConnStamp(connection)
    ) {
      return cached;
    }

    const uris = new Set<string>();
    let cursor: string | undefined;
    // A template-only server may not implement resources/list; treat its failure as an empty
    // concrete list so advertised templates below are still collected and can authorize reads.
    try {
      for (let page = 0; page < MCPManager.RESOURCE_LIST_MAX_PAGES; page++) {
        const result: ListResourcesResult = await connection.client.request(
          { method: 'resources/list', params: cursor != null ? { cursor } : {} },
          ListResourcesResultSchema,
          { timeout: connection.timeout },
        );
        for (const resource of result.resources) {
          uris.add(resource.uri);
        }
        if (result.nextCursor == null) {
          break;
        }
        cursor = result.nextCursor;
      }
    } catch (error) {
      logger.debug(`[MCP][${cacheKey}] resources/list unavailable; using templates only.`, error);
    }

    const templates: RegExp[] = [];
    try {
      cursor = undefined;
      for (let page = 0; page < MCPManager.RESOURCE_LIST_MAX_PAGES; page++) {
        const result: ListResourceTemplatesResult = await connection.client.request(
          { method: 'resources/templates/list', params: cursor != null ? { cursor } : {} },
          ListResourceTemplatesResultSchema,
          { timeout: connection.timeout },
        );
        for (const template of result.resourceTemplates) {
          // Compile templates in the same decoded space the requested URI is canonicalized into,
          // so matching is encoding-agnostic; fall back to the raw template if it is not valid
          // percent-encoding.
          let templateStr = template.uriTemplate;
          try {
            templateStr = decodeURIComponent(templateStr);
          } catch {
            /* keep raw template */
          }
          const pattern = MCPManager.uriTemplateToRegExp(templateStr);
          if (pattern) {
            templates.push(pattern);
          }
        }
        if (result.nextCursor == null) {
          break;
        }
        cursor = result.nextCursor;
      }
    } catch (error) {
      logger.debug(
        `[MCP][${cacheKey}] resources/templates/list unavailable; skipping templates.`,
        error,
      );
    }

    const entry = { uris, templates };
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
   */
  private static uriTemplateToRegExp(template: string): RegExp | null {
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
        const op = expr[0] ?? '';
        // Variable names declared in this expansion (operator + `:prefix`/`*explode` modifiers
        // stripped), used to constrain query expansions to their declared keys rather than an
        // open query string.
        const keys = expr
          .replace(/^[+#./;?&]/, '')
          .split(',')
          .map((name) => name.split(/[:*]/)[0].trim())
          .filter(Boolean)
          .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|');
        switch (op) {
          case '+': // reserved expansion: may legitimately include "/"
            pattern += '[^?#]+';
            break;
          case '#': // fragment
            pattern += '#[^\\s]*';
            break;
          case '/': // path segments
            pattern += '(?:/[^/?#]+)+';
            break;
          case '.': // label(s)
            pattern += '(?:\\.[^/?#]+)+';
            break;
          case ';': // path-style params
            pattern += '(?:;[^/?#]+)+';
            break;
          case '?': // query: only the declared parameter names, in any order
            pattern += keys ? `\\?(?:${keys})=[^#&]*(?:&(?:${keys})=[^#&]*)*` : '\\?[^#]*';
            break;
          case '&': // query continuation: only the declared parameter names
            pattern += keys ? `(?:&(?:${keys})=[^#&]*)+` : '&[^#]*';
            break;
          default: // simple expansion: a single value. RFC 6570 percent-encodes reserved chars,
            // so a real value never contains a raw `&` or `=`; excluding them stops a query value
            // like `q={q}` from matching `q=foo&admin=true` and authorizing an undeclared param.
            pattern += '[^/?#&=]+';
        }
        i = end + 1;
      }
      return new RegExp(`^${pattern}$`);
    } catch {
      return null;
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

    const result = await connection.client.request(
      {
        method: 'resources/list',
        params: cursor != null ? { cursor } : {},
      },
      ListResourcesResultSchema,
      { timeout: connection.timeout },
    );

    return result;
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

    const result = await connection.client.request(
      {
        method: 'resources/templates/list',
        params: cursor != null ? { cursor } : {},
      },
      ListResourceTemplatesResultSchema,
      { timeout: connection.timeout },
    );

    return result;
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

    const result = await connection.client.request(
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

    return result;
  }
}
