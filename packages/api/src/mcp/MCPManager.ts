import pick from 'lodash/pick';
import { logger } from '@librechat/data-schemas';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { CallToolResultSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { TokenMethods, IUser } from '@librechat/data-schemas';
import type { MCPToolCatalogScope, MCPToolCatalogScopeInput } from './catalog';
import type { OboTokenResolver, OboTrustChecker } from '~/mcp/oauth/obo';
import type { GraphTokenResolver } from '~/utils/graph';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens } from './oauth';
import type { RequestBody } from '~/types';
import type * as t from './types';
import {
  getMissingRuntimeBodyPlaceholderFields,
  isOAuthServer,
  isUserSourced,
  requiresEphemeralUserConnection,
  requiresOAuthMachinery,
  requiresUserScopedConnection,
  shouldDetectRuntimeOAuth,
} from './utils';
import {
  createMCPToolCatalogSecurityPolicyIdentity,
  isMCPToolCatalogFingerprintAvailable,
  matchesMCPConnectionProvenance,
} from './catalog';
import { MCPServersInitializer } from './registry/MCPServersInitializer';
import { OboTokenResolutionError, resolveOboToken } from '~/mcp/oauth';
import { MCPServerInspector } from './registry/MCPServerInspector';
import { MCPServersRegistry } from './registry/MCPServersRegistry';
import { UserConnectionManager } from './UserConnectionManager';
import { ConnectionsRepository } from './ConnectionsRepository';
import { MCPConnectionFactory } from './MCPConnectionFactory';
import { preProcessGraphTokens } from '~/utils/graph';
import { formatToolContent } from './parsers';
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

function matchesIssuedConnectionProvenance(
  provenance: t.MCPConnectionProvenance | null | undefined,
  scope: MCPToolCatalogScope,
  authorizationKind: t.MCPConnectionProvenance['authorizationKind'],
): boolean {
  return (
    provenance != null &&
    provenance.authorizationKind === authorizationKind &&
    provenance.scope.tenant === scope.tenant &&
    provenance.scope.principal === scope.principal &&
    provenance.scope.server === scope.server &&
    provenance.scope.policy === scope.policy &&
    provenance.scope.config === scope.config &&
    provenance.scope.credentials === scope.credentials
  );
}

/**
 * Centralized manager for MCP server connections and tool execution.
 * Extends UserConnectionManager to handle both app-level and user-specific connections.
 */
export class MCPManager extends UserConnectionManager {
  private static instance: MCPManager | null;

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
    } & Omit<t.OAuthConnectionOptions, 'useOAuth' | 'user' | 'flowManager'>,
  ): Promise<MCPConnection> {
    const userId = args.user?.id;
    const sourceConfig = args.serverConfig;
    const effectiveConfig = args.effectiveServerConfig;
    const securityPolicy = args.securityPolicy;
    const authorityScope = args.oauthAuthorityScope;
    const authorizationKind = args.authorityAuthorizationKind;
    if (!sourceConfig || !effectiveConfig || !securityPolicy) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Proof-bound connection input is required for server ${args.serverName}`,
      );
    }

    if (userId && requiresUserScopedConnection(sourceConfig)) {
      return this.getUserConnection({
        ...args,
        serverConfig: sourceConfig,
      } as Parameters<typeof this.getUserConnection>[0]);
    }

    //the get method checks if the config is still valid as app level
    const existingAppConnection = await this.appConnections!.get(args.serverName);
    if (existingAppConnection) {
      if (!userId || !isMCPToolCatalogFingerprintAvailable()) {
        return existingAppConnection;
      }
      const appProvenance = existingAppConnection.getDiscoveryProvenance();
      const appConnectionMatchesPrincipal =
        authorityScope && authorizationKind
          ? matchesIssuedConnectionProvenance(appProvenance, authorityScope, authorizationKind)
          : matchesMCPConnectionProvenance(appProvenance, {
              tenantId: args.user?.tenantId ?? null,
              userId,
              serverName: args.serverName,
              serverConfig: sourceConfig,
              effectiveServerConfig: effectiveConfig,
              securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
                allowedDomains: securityPolicy.allowedDomains,
                allowedAddresses: securityPolicy.allowedAddresses,
              }),
              authorizationIdentity: 'none',
            });
      if (appConnectionMatchesPrincipal) {
        return existingAppConnection;
      }
      return this.getIsolatedUserConnection({
        ...args,
        serverConfig: sourceConfig,
      } as Parameters<typeof this.getUserConnection>[0]);
    } else if (userId) {
      return this.getUserConnection({
        ...args,
        serverConfig: sourceConfig,
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
    const tenantId = user?.tenantId ?? null;
    const serverConfig = args.serverConfig;
    const effectiveServerConfig = args.effectiveServerConfig;
    const securityPolicy = args.securityPolicy;
    const authorityScope = args.oauthAuthorityScope;
    const authorizationKind = args.authorityAuthorizationKind;
    if (!serverConfig || !effectiveServerConfig || !securityPolicy) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `${logPrefix} [Discovery] Proof-bound discovery input is required`,
      );
    }

    const missingBodyFields = getMissingRuntimeBodyPlaceholderFields(
      serverConfig,
      args.requestBody,
    );
    if (missingBodyFields.length > 0) {
      logger.warn(
        `${logPrefix} [Discovery] Request body field(s) required to resolve runtime MCP placeholders: ${missingBodyFields.join(', ')}`,
      );
      return { tools: null, oauthRequired: false, oauthUrl: null, provenance: null };
    }

    await this.assertExactRuntimeConfigAllowed({
      effectiveConfig: effectiveServerConfig,
      securityPolicy,
      logPrefix: `${logPrefix} [Discovery]`,
    });

    try {
      const existingAppConnection = await this.appConnections?.get(serverName);
      if (existingAppConnection && (await existingAppConnection.isConnected())) {
        const appProvenance = existingAppConnection.getDiscoveryProvenance();
        const appConnectionMatchesScope =
          authorityScope && authorizationKind
            ? matchesIssuedConnectionProvenance(appProvenance, authorityScope, authorizationKind)
            : !isMCPToolCatalogFingerprintAvailable() ||
              matchesMCPConnectionProvenance(appProvenance, {
                tenantId,
                userId: user?.id ?? '__app__',
                serverName,
                serverConfig,
                effectiveServerConfig,
                securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
                  allowedDomains: securityPolicy.allowedDomains,
                  allowedAddresses: securityPolicy.allowedAddresses,
                }),
                customUserVars: args.customUserVars,
                authorizationIdentity: 'none',
              });
        if (appConnectionMatchesScope) {
          const tools = await existingAppConnection.fetchTools();
          return {
            tools,
            oauthRequired: false,
            oauthUrl: null,
            provenance: existingAppConnection.getDiscoveryProvenance?.() ?? null,
          };
        }
        logger.debug(
          `${logPrefix} [Discovery] Shared connection scope differs; using isolated discovery`,
        );
      }
    } catch {
      logger.debug(`${logPrefix} [Discovery] App connection not available, trying discovery mode`);
    }

    const useOAuth = requiresOAuthMachinery(serverConfig);
    const dbSourced = isUserSourced(serverConfig);
    const basic: t.BasicConnectionOptions = {
      dbSourced,
      serverName,
      serverConfig: effectiveServerConfig,
      declarativeServerConfig: serverConfig,
      skipEnvProcessing: true,
      useSSRFProtection: securityPolicy.useSSRFProtection,
      allowedDomains: securityPolicy.allowedDomains,
      allowedAddresses: securityPolicy.allowedAddresses,
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
        provenance: result.provenance,
      };
    };

    if (!useOAuth) {
      const result = await MCPConnectionFactory.discoverTools(basic, {
        user: args.user,
        customUserVars: args.customUserVars,
        requestBody: args.requestBody,
        effectiveServerConfig,
        securityPolicy,
        connectionTimeout: args.connectionTimeout,
        oauthAuthorityScope: authorityScope,
        authorityAuthorizationKind: authorizationKind,
      });
      return finalizeDiscoveryResult(result);
    }

    if (!user || !args.flowManager) {
      logger.warn(`${logPrefix} [Discovery] OAuth server requires user and flowManager`);
      return { tools: null, oauthRequired: true, oauthUrl: null, provenance: null };
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
      effectiveServerConfig,
      securityPolicy,
      connectionTimeout: args.connectionTimeout,
      oboTokenResolver: args.oboTokenResolver,
      oboTrustChecker: args.oboTrustChecker,
      oauthAuthorityScope: args.oauthAuthorityScope,
      authorityAuthorizationKind: authorizationKind,
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
    const result = await this.getServerToolFunctionsResult(userId, serverName);
    return result?.tools ?? null;
  }

  public async getServerToolFunctionsWithProvenance(
    userId: string,
    serverName: string,
    expectedScope: MCPToolCatalogScopeInput,
  ): Promise<{
    tools: t.LCAvailableTools;
    provenance: ReturnType<MCPConnection['getDiscoveryProvenance']>;
  } | null> {
    return this.getServerToolFunctionsResult(userId, serverName, expectedScope);
  }

  private async getServerToolFunctionsResult(
    userId: string,
    serverName: string,
    expectedScope?: MCPToolCatalogScopeInput,
  ): Promise<{
    tools: t.LCAvailableTools;
    provenance: ReturnType<MCPConnection['getDiscoveryProvenance']>;
  } | null> {
    try {
      //try get the appConnection (if the config is not in the app level anymore any existing connection will disconnect and get will return null)
      const existingAppConnection = await this.appConnections?.get(serverName);
      if (existingAppConnection) {
        const provenance = existingAppConnection.getDiscoveryProvenance?.() ?? null;
        const runtimeOAuthRequiresPostValidation =
          expectedScope != null &&
          provenance?.authorizationKind === 'oauth' &&
          shouldDetectRuntimeOAuth(expectedScope.serverConfig);
        if (
          expectedScope &&
          !runtimeOAuthRequiresPostValidation &&
          !matchesMCPConnectionProvenance(provenance, expectedScope)
        ) {
          return null;
        }
        return {
          tools: await MCPServerInspector.getToolFunctions(serverName, existingAppConnection),
          provenance,
        };
      }

      const userConnections = this.getUserConnections(userId);
      if (!userConnections || userConnections.size === 0) {
        return null;
      }
      if (!userConnections.has(serverName)) {
        return null;
      }

      const connection = userConnections.get(serverName)!;
      const provenance = connection.getDiscoveryProvenance?.() ?? null;
      const runtimeOAuthRequiresPostValidation =
        expectedScope != null &&
        provenance?.authorizationKind === 'oauth' &&
        shouldDetectRuntimeOAuth(expectedScope.serverConfig);
      if (
        expectedScope &&
        !runtimeOAuthRequiresPostValidation &&
        !matchesMCPConnectionProvenance(provenance, expectedScope)
      ) {
        await this.disconnectUserConnection(userId, serverName, connection);
        return null;
      }
      return {
        tools: await MCPServerInspector.getToolFunctions(serverName, connection),
        provenance,
      };
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
    effectiveServerConfig,
    securityPolicy,
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
    oauthAuthorityScope,
    authorityAuthorizationKind,
    refreshAuthorityLifecycle,
    bindWithCurrentAuthority,
    beforeExecute,
    executeWithCurrentAuthority,
  }: {
    user?: IUser;
    serverName: string;
    /** Pre-resolved config from tool creation context — avoids readThrough TTL and cross-tenant issues */
    serverConfig?: t.ParsedServerConfig;
    effectiveServerConfig?: t.MCPOptions;
    securityPolicy?: t.UserConnectionContext['securityPolicy'];
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
    oauthAuthorityScope?: MCPToolCatalogScope;
    authorityAuthorizationKind?: t.MCPConnectionProvenance['authorizationKind'];
    refreshAuthorityLifecycle?: t.MCPRefreshAuthorityLifecycle;
    bindWithCurrentAuthority?: <Result>(bind: () => Promise<Result>) => Promise<Result>;
    beforeExecute?: (context: {
      connectionProvenance: t.MCPConnectionProvenance | null;
      serverConfig: t.ParsedServerConfig;
    }) => Promise<void>;
    executeWithCurrentAuthority?: <Result>(
      execute: () => Promise<Result>,
      context: {
        connectionProvenance: t.MCPConnectionProvenance | null;
        serverConfig: t.ParsedServerConfig;
      },
    ) => Promise<Result>;
  }): Promise<t.FormattedToolResponse> {
    /** User-specific connection */
    let connection: MCPConnection | undefined;
    let cleanupRequestOAuthHandler: (() => void) | undefined;
    let disconnectAfterCall = false;
    const userId = user?.id;
    const logPrefix = userId ? `[MCP][User: ${userId}][${serverName}]` : `[MCP][${serverName}]`;

    try {
      const bind = async () =>
        await this.getConnection({
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
          effectiveServerConfig,
          securityPolicy,
          oauthAuthorityScope,
          authorityAuthorizationKind,
          refreshAuthorityLifecycle,
        });
      connection = bindWithCurrentAuthority ? await bindWithCurrentAuthority(bind) : await bind();

      if (!(await connection.isConnected())) {
        /** May happen if getUserConnection failed silently or app connection dropped */
        throw new McpError(
          ErrorCode.InternalError, // Use InternalError for connection issues
          `${logPrefix} Connection is not active. Cannot execute tool ${toolName}.`,
        );
      }
      const activeConnection = connection;

      const registry = MCPServersRegistry.getInstance();
      const authorityInputs = [
        effectiveServerConfig,
        securityPolicy,
        oauthAuthorityScope,
        authorityAuthorizationKind,
      ];
      const hasAnyAuthorityInput = authorityInputs.some((value) => value != null);
      const proofBound = providedConfig != null && authorityInputs.every((value) => value != null);
      if (hasAnyAuthorityInput && !proofBound) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `${logPrefix} Incomplete proof-bound tool execution input.`,
        );
      }
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

      let currentOptions: t.ParsedServerConfig;
      if (proofBound) {
        currentOptions = effectiveServerConfig!;
      } else {
        const graphProcessedConfig = isDbSourced
          ? (rawConfig as t.MCPOptions)
          : await preProcessGraphTokens(rawConfig as t.MCPOptions, {
              user,
              graphTokenResolver,
              scopes: process.env.GRAPH_API_SCOPES,
            });
        currentOptions = processMCPEnv({
          user,
          body: requestBody,
          dbSourced: isDbSourced,
          options: graphProcessedConfig,
          customUserVars,
        }) as t.ParsedServerConfig;
      }

      const resolvedHeaders: Record<string, string> =
        'headers' in currentOptions ? { ...(currentOptions.headers || {}) } : {};

      /** Refresh OBO token on each tool call to ensure it's current */
      const oboConfig = rawConfig.obo;
      if (oboConfig && oboTokenResolver && user) {
        if (isDbSourced && !oboTrustChecker) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `${logPrefix} OBO author trust proof is required for user-authored server "${serverName}".`,
          );
        }
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
        const resolvedPolicy = proofBound
          ? securityPolicy!
          : await registry.resolveAllowlists({
              userId,
              role: user?.role,
              tenantId: user?.tenantId ?? null,
            });
        cleanupRequestOAuthHandler = MCPConnectionFactory.attachRequestOAuthHandler(
          {
            serverName,
            serverConfig: currentOptions,
            declarativeServerConfig: rawConfig,
            dbSourced: isDbSourced,
            skipEnvProcessing: true,
            useSSRFProtection: resolvedPolicy.useSSRFProtection,
            allowedDomains: resolvedPolicy.allowedDomains,
            allowedAddresses: resolvedPolicy.allowedAddresses,
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
            effectiveServerConfig,
            securityPolicy,
            oauthAuthorityScope,
            authorityAuthorizationKind,
            refreshAuthorityLifecycle,
          },
          activeConnection,
        );
      }

      activeConnection.setRequestHeaders(resolvedHeaders);

      const executionContext = {
        connectionProvenance: activeConnection.getDiscoveryProvenance?.() ?? null,
        serverConfig: rawConfig,
      };
      const execute = async () =>
        await activeConnection.client.request(
          {
            method: 'tools/call',
            params: {
              name: toolName,
              arguments: toolArguments,
            },
          },
          CallToolResultSchema,
          {
            timeout: activeConnection.timeout,
            resetTimeoutOnProgress: true,
            ...options,
          },
        );
      let result: Awaited<ReturnType<typeof execute>>;
      if (executeWithCurrentAuthority) {
        result = await executeWithCurrentAuthority(execute, executionContext);
      } else {
        await beforeExecute?.(executionContext);
        result = await execute();
      }
      const hasPersistentUserConnections =
        !!userId && (this.userConnections.get(userId)?.size ?? 0) > 0;
      if (!ephemeralConnection && hasPersistentUserConnections) {
        this.updateUserLastActivity(userId);
      }
      this.checkIdleConnections();
      return formatToolContent(result, provider);
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
      } else if (userId && connection) {
        try {
          await this.releaseDetachedUserConnection(userId, serverName, connection);
        } catch (disconnectError) {
          logger.warn(`${logPrefix}[${toolName}] Failed to release detached connection`, {
            error: disconnectError,
          });
        }
      }
    }
  }
}
