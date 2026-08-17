import pick from 'lodash/pick';
import { logger } from '@librechat/data-schemas';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { CallToolResultSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { TokenMethods, IUser } from '@librechat/data-schemas';
import type { OboTokenResolver, OboTrustChecker } from '~/mcp/oauth/obo';
import type { GraphTokenResolver } from '~/utils/graph';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens } from './oauth';
import type { RequestBody } from '~/types';
import type * as t from './types';
import {
  getMissingRuntimeBodyPlaceholderFields,
  canUseAppConnection,
  isOAuthServer,
  isUserSourced,
  requiresEphemeralUserConnection,
  requiresOAuthMachinery,
  requiresUserScopedConnection,
  resolveServerInstructions,
} from './utils';
import { getMCPAppToolsPublicationGeneration, getMCPToolsChangedGeneration } from './toolsChanged';
import { MCPServersInitializer } from './registry/MCPServersInitializer';
import { OboTokenResolutionError, resolveOboToken } from '~/mcp/oauth';
import { MCPServerInspector } from './registry/MCPServerInspector';
import { MCPServersRegistry } from './registry/MCPServersRegistry';
import { UserConnectionManager } from './UserConnectionManager';
import { ConnectionsRepository } from './ConnectionsRepository';
import { MCPConnectionFactory } from './MCPConnectionFactory';
import { processMCPEnv, isPluginSourced } from '~/utils/env';
import { OAuthLifecycleRelay } from './oauth/pending';
import { preProcessGraphTokens } from '~/utils/graph';
import { formatToolContent } from './parsers';
import { MCPConnection } from './connection';
import { mcpConfig } from './mcpConfig';

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

class OAuthRecoveryTakeoverRequired extends Error {}

type OAuthReconnectResult =
  | { connected: true }
  | {
      connected: false;
      error: unknown;
      oauthHandled: boolean;
      source?: t.OAuthHandledSource;
    };

const OAUTH_RECOVERY_RECONNECT_ATTEMPTS = 3;
const OAUTH_RECOVERY_RECONNECT_DELAY_MS = 2000;

/**
 * Centralized manager for MCP server connections and tool execution.
 * Extends UserConnectionManager to handle both app-level and user-specific connections.
 */
export class MCPManager extends UserConnectionManager {
  private static instance: MCPManager | null;
  private readonly oauthRecoveries = new WeakMap<
    MCPConnection,
    {
      promise: Promise<void>;
      callbacks: OAuthLifecycleRelay;
      allowsTakeover: boolean;
      takeoverClaimed?: boolean;
    }
  >();

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

  public override async getUserConnection(
    opts: t.UserMCPConnectionOptions,
  ): Promise<MCPConnection> {
    const userId = opts.user?.id;
    if (opts.forceNew || !userId) {
      return super.getUserConnection(opts);
    }

    const connectionKey = `${userId}:${opts.serverName}`;
    const requestConnection = opts.requestScopedConnections?.connections.get(connectionKey) as
      | MCPConnection
      | undefined;
    const connection = requestConnection ?? this.userConnections.get(userId)?.get(opts.serverName);
    const recovery = connection ? this.oauthRecoveries.get(connection) : undefined;
    const providedConfigIsNewer =
      connection != null &&
      opts.serverConfig?.updatedAt != null &&
      connection.isStale(opts.serverConfig.updatedAt);
    if (recovery && !providedConfigIsNewer) {
      if (recovery.callbacks) {
        await recovery.callbacks.add({
          oauthStart: opts.oauthStart,
          oauthEnd: opts.oauthEnd,
          flowManager: opts.flowManager,
          userId,
          serverName: opts.serverName,
        });
      }
      await this.waitForActiveRecovery(recovery.promise, opts.signal);
    }

    return super.getUserConnection(opts);
  }

  /** Runs work against a user connection while preventing recovery from replacing its SDK client. */
  public async withUserConnectionLease<TResult>(
    opts: t.UserMCPConnectionOptions,
    operation: (connection: MCPConnection) => Promise<TResult>,
  ): Promise<TResult> {
    while (true) {
      const connection = await this.getUserConnection(opts);
      this.retainConnection(connection);
      const recovery = this.oauthRecoveries.get(connection)?.promise;
      if (recovery) {
        await this.releaseConnection(connection);
        await this.waitForActiveRecovery(recovery, opts.signal);
        continue;
      }

      try {
        return await operation(connection);
      } finally {
        await this.releaseConnection(connection);
      }
    }
  }

  private waitForActiveRecovery(recovery: Promise<void>, signal?: AbortSignal): Promise<void> {
    if (!signal) {
      return recovery;
    }

    return new Promise<void>((resolve, reject) => {
      const onRecoveryResolved = () => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      };
      const onRecoveryRejected = (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      };
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort);
        const reason = signal.reason;
        reject(reason instanceof Error ? reason : new Error('OAuth recovery wait aborted'));
      };

      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });
      recovery.then(onRecoveryResolved, onRecoveryRejected);
    });
  }

  protected override getActiveConnectionRecovery(
    connection: MCPConnection,
  ): Promise<void> | undefined {
    return this.oauthRecoveries.get(connection)?.promise;
  }

  protected override waitForConnectionRecovery(
    recovery: Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.waitForActiveRecovery(recovery, signal);
  }

  private claimRecoveryTakeover(recovery: {
    allowsTakeover: boolean;
    takeoverClaimed?: boolean;
  }): boolean {
    if (!recovery.allowsTakeover || recovery.takeoverClaimed) {
      return false;
    }
    recovery.takeoverClaimed = true;
    return true;
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
    publicationRevision?: string;
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
        return MCPServerInspector.getToolCatalog(serverName, existingAppConnection);
      }

      let awaitedRecovery: Promise<void> | undefined;
      while (true) {
        const userConnections = this.getUserConnections(userId);
        const connection = userConnections?.get(serverName);
        if (!connection) {
          return { tools: null };
        }

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

        this.retainConnection(connection);
        const recovery = this.oauthRecoveries.get(connection)?.promise;
        if (recovery && recovery !== awaitedRecovery) {
          awaitedRecovery = recovery;
          await this.releaseConnection(connection);
          await this.waitForConnectionRecovery(recovery);
          continue;
        }

        try {
          const { tools } = await MCPServerInspector.getToolCatalog(serverName, connection);
          const generationAfterFetch = await getMCPToolsChangedGeneration({ userId, serverName });
          if (
            publicationGeneration != null &&
            generationAfterFetch != null &&
            publicationGeneration !== generationAfterFetch
          ) {
            await this.disconnectUserConnection(userId, serverName);
            return { tools: null };
          }
          return { tools, publicationGeneration };
        } finally {
          await this.releaseConnection(connection);
        }
      }
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
      const resolved = resolveServerInstructions(config);
      if (resolved != null) {
        instructions[serverName] = resolved;
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

  private async recoverOAuthConnection(
    connection: MCPConnection,
    error: unknown,
    serverName: string,
    userId: string,
    attachSharedOAuthHandler: (relay: OAuthLifecycleRelay) => () => void,
    oauthStart: t.OAuthStartHandler | undefined,
    oauthEnd: (() => Promise<void>) | undefined,
    flowManager: FlowStateManager<MCPOAuthTokens | null>,
    signal?: AbortSignal,
    allowsTakeover = true,
  ): Promise<void> {
    const existingRecovery = this.oauthRecoveries.get(connection);
    if (existingRecovery) {
      if (existingRecovery.callbacks) {
        await existingRecovery.callbacks.add({
          oauthStart,
          oauthEnd,
          flowManager,
          userId,
          serverName,
        });
      }
      try {
        return await this.waitForActiveRecovery(existingRecovery.promise, signal);
      } catch (recoveryError) {
        if (signal?.aborted) {
          throw recoveryError;
        }
        if (!allowsTakeover || !this.claimRecoveryTakeover(existingRecovery)) {
          throw recoveryError;
        }
        if (this.oauthRecoveries.get(connection) === existingRecovery) {
          this.oauthRecoveries.delete(connection);
        }
        throw new OAuthRecoveryTakeoverRequired();
      }
    }

    const callbacks = new OAuthLifecycleRelay({
      oauthStart,
      oauthEnd,
      logPrefix: `[MCP][User: ${userId}][${serverName}]`,
    });
    const recovery = Promise.resolve().then(async () => {
      const cleanupRequestOAuthHandler = attachSharedOAuthHandler(callbacks);
      try {
        await this.waitForOAuthRecovery(connection, () =>
          connection.emit('oauthReauthenticationRequired', {
            serverName,
            error,
            serverUrl: connection.url,
            userId,
          }),
        );
        await this.connectAfterOAuthRecovery(connection, async (connectError) => {
          await this.waitForOAuthRecovery(connection, () =>
            connection.emit('oauthReauthenticationRequired', {
              serverName,
              error: connectError,
              serverUrl: connection.url,
              userId,
              skipSilentRefresh: true,
            }),
          );
        });
      } finally {
        cleanupRequestOAuthHandler();
      }
    });

    const recoveryEntry = { promise: recovery, callbacks, allowsTakeover, takeoverClaimed: false };
    this.oauthRecoveries.set(connection, recoveryEntry);
    this.holdDeferredConnectionDisposal(connection);
    const clearRecovery = () => {
      if (this.oauthRecoveries.get(connection) === recoveryEntry) {
        this.oauthRecoveries.delete(connection);
      }
    };
    const releaseRecoveryDisposal = () => this.releaseDeferredConnectionDisposal(connection);
    void recovery.then(clearRecovery, clearRecovery);
    void recovery.then(releaseRecoveryDisposal, releaseRecoveryDisposal);
    await this.waitForActiveRecovery(recovery, signal);
  }

  private async connectAfterOAuthRecovery(
    connection: MCPConnection,
    requestInteractiveRecovery: (error: unknown) => Promise<void>,
  ): Promise<void> {
    await this.waitForConnectionBorrowersToDrain(connection);
    const firstAttempt = await this.connectWithTransientRetries(connection);
    if (firstAttempt.connected) {
      return;
    }
    if (!firstAttempt.oauthHandled) {
      throw firstAttempt.error;
    }
    if (firstAttempt.source === 'silent-refresh') {
      await requestInteractiveRecovery(firstAttempt.error);
    }

    const secondAttempt = await this.connectWithTransientRetries(connection);
    if (!secondAttempt.connected) {
      throw secondAttempt.error;
    }
  }

  private async connectWithTransientRetries(
    connection: MCPConnection,
  ): Promise<OAuthReconnectResult> {
    let result: OAuthReconnectResult | undefined;
    for (let attempt = 1; attempt <= OAUTH_RECOVERY_RECONNECT_ATTEMPTS; attempt++) {
      result = await this.connectOnceAfterOAuth(connection);
      if (
        result.connected ||
        result.oauthHandled ||
        connection.isOAuthAuthenticationError(result.error) ||
        attempt === OAUTH_RECOVERY_RECONNECT_ATTEMPTS
      ) {
        return result;
      }
      await this.waitForOAuthReconnectRetry(attempt);
    }
    return result!;
  }

  private waitForOAuthReconnectRetry(attempt: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, OAUTH_RECOVERY_RECONNECT_DELAY_MS * attempt);
    });
  }

  private async connectOnceAfterOAuth(connection: MCPConnection): Promise<OAuthReconnectResult> {
    let oauthHandled = false;
    let source: t.OAuthHandledSource | undefined;
    const handleOAuth = (handledSource?: t.OAuthHandledSource) => {
      oauthHandled = true;
      source = handledSource;
    };
    connection.on('oauthHandled', handleOAuth);
    try {
      await connection.connect();
      return { connected: true };
    } catch (error) {
      return { connected: false, error, oauthHandled, source };
    } finally {
      connection.off('oauthHandled', handleOAuth);
    }
  }

  private waitForOAuthRecovery(
    connection: MCPConnection,
    requestRecovery: () => boolean,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        connection.off('oauthHandled', handleSuccess);
        connection.off('oauthFailed', handleFailure);
      };
      const handleSuccess = () => {
        cleanup();
        resolve();
      };
      const handleFailure = (oauthError: Error) => {
        cleanup();
        reject(oauthError);
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`OAuth recovery timeout after ${mcpConfig.OAUTH_HANDLING_TIMEOUT}ms`));
      }, mcpConfig.OAUTH_HANDLING_TIMEOUT);

      connection.once('oauthHandled', handleSuccess);
      connection.once('oauthFailed', handleFailure);

      let recoveryRequested: boolean;
      try {
        recoveryRequested = requestRecovery();
      } catch (error) {
        cleanup();
        reject(error);
        return;
      }
      if (recoveryRequested) {
        return;
      }
      cleanup();
      reject(new Error('OAuth recovery requested without an active request handler'));
    });
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
    const userId = user?.id;
    const logPrefix = userId ? `[MCP][User: ${userId}][${serverName}]` : `[MCP][${serverName}]`;
    this.bindRequestScopedConnectionStore(requestScopedConnections);
    let recoveryTakeoverConsumed = false;
    while (true) {
      /** User-specific connection */
      let connection: MCPConnection | undefined;
      let connectionRetained = false;
      let deferredDisposalHeld = false;
      let attachSharedOAuthHandler: ((relay: OAuthLifecycleRelay) => () => void) | undefined;
      let disposeAfterCall = false;
      const retainConnectionLease = () => {
        if (!connection || connectionRetained) {
          return;
        }
        this.retainConnection(connection);
        connectionRetained = true;
      };
      const releaseConnectionLease = async (preserveDisposalHold = false) => {
        if (!connection || !connectionRetained) {
          return;
        }
        if (deferredDisposalHeld && !preserveDisposalHold) {
          await this.releaseDeferredConnectionDisposal(connection);
          deferredDisposalHeld = false;
        }
        connectionRetained = false;
        await this.releaseConnection(connection);
      };
      const waitForRecoveryWithoutLease = async (startRecovery: () => Promise<void>) => {
        const recovery = startRecovery();
        // Keep an eviction marker across the temporary lease gap and transfer that
        // responsibility back to this caller after recovery. An unrelated final
        // borrower may disconnect the old client, but cannot consume the marker.
        if (!deferredDisposalHeld) {
          this.holdDeferredConnectionDisposal(connection!);
          deferredDisposalHeld = true;
        }
        await releaseConnectionLease(true);
        try {
          await recovery;
        } finally {
          retainConnectionLease();
        }
      };

      try {
        let awaitedCheckoutRecovery: Promise<void> | undefined;
        while (true) {
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
          retainConnectionLease();
          const checkoutRecovery = this.oauthRecoveries.get(connection);
          if (!checkoutRecovery || checkoutRecovery.promise === awaitedCheckoutRecovery) {
            break;
          }
          if (checkoutRecovery.callbacks) {
            await checkoutRecovery.callbacks.add({
              oauthStart,
              oauthEnd,
              flowManager,
              userId: userId!,
              serverName,
            });
          }
          awaitedCheckoutRecovery = checkoutRecovery.promise;
          await releaseConnectionLease();
          try {
            await this.waitForConnectionRecovery(checkoutRecovery.promise, options?.signal);
          } catch (recoveryError) {
            if (
              options?.signal?.aborted ||
              recoveryTakeoverConsumed ||
              !this.claimRecoveryTakeover(checkoutRecovery)
            ) {
              throw recoveryError;
            }
            recoveryTakeoverConsumed = true;
            if (this.oauthRecoveries.get(connection) === checkoutRecovery) {
              this.oauthRecoveries.delete(connection);
            }
            continue;
          }
        }

        const connectionIsActive = await connection.isConnected();
        const connectionCheckError = connectionIsActive
          ? undefined
          : connection.getLastConnectionCheckError();

        if (
          !connectionIsActive &&
          (!userId || !connection.isOAuthAuthenticationError(connectionCheckError))
        ) {
          /** May happen if getUserConnection failed silently or app connection dropped */
          throw new McpError(
            ErrorCode.InternalError,
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
        disposeAfterCall = ephemeralConnection && !requestScopedConnections;

        /** Plugin-authored placeholders must not resolve against the user's Graph token. */
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
        if (
          userId &&
          user &&
          oauthStart &&
          flowManager &&
          (isOAuthServer(currentOptions) || connection.usesOAuth())
        ) {
          const { allowedDomains, allowedAddresses, useSSRFProtection } =
            await registry.resolveAllowlists({ userId, role: user?.role });
          attachSharedOAuthHandler = (relay) =>
            MCPConnectionFactory.attachRequestOAuthHandler(
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
                oauthStart: relay.start,
                oauthEnd: relay.end,
                customUserVars,
                requestBody,
              },
              connection!,
            );
        }

        connection.setRequestHeaders(resolvedHeaders);

        if (!connectionIsActive) {
          const requestOAuthHandler = attachSharedOAuthHandler;
          if (!requestOAuthHandler || !userId) {
            throw new McpError(
              ErrorCode.InternalError,
              `${logPrefix} Connection is not active. Cannot execute tool ${toolName}.`,
            );
          }

          try {
            await waitForRecoveryWithoutLease(() =>
              this.recoverOAuthConnection(
                connection!,
                connectionCheckError,
                serverName,
                userId,
                requestOAuthHandler,
                oauthStart,
                oauthEnd,
                flowManager,
                options?.signal,
                !recoveryTakeoverConsumed,
              ),
            );
          } catch (recoveryError) {
            if (recoveryError instanceof OAuthRecoveryTakeoverRequired) {
              throw recoveryError;
            }
            if (options?.signal?.aborted) {
              throw recoveryError;
            }
            logger.warn(
              `${logPrefix}[${toolName}] Connection-check OAuth recovery failed`,
              recoveryError,
            );
            throw connectionCheckError;
          }
        }

        const requestTool = () =>
          connection!.client.request(
            {
              method: 'tools/call',
              params: {
                name: toolName,
                arguments: toolArguments,
              },
            },
            CallToolResultSchema,
            {
              timeout: connection!.timeout,
              resetTimeoutOnProgress: true,
              ...options,
            },
          );

        let result: Awaited<ReturnType<typeof requestTool>>;
        try {
          result = await requestTool();
        } catch (error) {
          const requestOAuthHandler = attachSharedOAuthHandler;
          if (!requestOAuthHandler || !userId) {
            throw error;
          }

          if (!connection.isOAuthAuthenticationError(error)) {
            throw error;
          }

          try {
            await waitForRecoveryWithoutLease(() =>
              this.recoverOAuthConnection(
                connection!,
                error,
                serverName,
                userId,
                requestOAuthHandler,
                oauthStart,
                oauthEnd,
                flowManager,
                options?.signal,
                !recoveryTakeoverConsumed,
              ),
            );
          } catch (recoveryError) {
            if (recoveryError instanceof OAuthRecoveryTakeoverRequired) {
              throw recoveryError;
            }
            if (options?.signal?.aborted) {
              throw recoveryError;
            }
            logger.warn(`${logPrefix}[${toolName}] Runtime OAuth recovery failed`, recoveryError);
            throw error;
          }
          result = await requestTool();
        }
        const hasPersistentUserConnections =
          !!userId && (this.userConnections.get(userId)?.size ?? 0) > 0;
        if (!ephemeralConnection && hasPersistentUserConnections) {
          await this.updateUserLastActivity(userId);
        }
        this.checkIdleConnections();
        return formatToolContent(result as t.MCPToolCallResponse, provider);
      } catch (error) {
        if (error instanceof OAuthRecoveryTakeoverRequired) {
          recoveryTakeoverConsumed = true;
          continue;
        }
        // Log with context and re-throw or handle as needed
        logger.error(`${logPrefix}[${toolName}] Tool call failed`, error);
        // Rethrowing allows the caller (createMCPTool) to handle the final user message
        throw error;
      } finally {
        await releaseConnectionLease();
        // Ephemeral connections are never stored in userConnections, so disposing
        // is the only cleanup needed; removing the map entry here could orphan a
        // still-connected cached connection from before a config change.
        if (disposeAfterCall && connection) {
          await this.disposeEvictedConnection(
            connection,
            `${logPrefix}[${toolName}] Ephemeral connection`,
          );
        }
      }
    }
  }
}
