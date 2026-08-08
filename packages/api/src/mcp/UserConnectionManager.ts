import { logger, getTenantId } from '@librechat/data-schemas';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { MCPAuthorizationTokenBatchFinder, MCPToolCatalogScopeInput } from './catalog';
import type { MCPOAuthFlowMetadata } from '~/mcp/oauth';
import type { FlowState } from '~/flow/types';
import type * as t from './types';
import {
  MCP_OBO_CONNECTION_AUTHORIZATION_IDENTITY,
  createMCPConnectionProvenance,
  createMCPToolCatalogSecurityPolicyIdentity,
  getMCPAuthorizationIdentity,
  isMCPToolCatalogFingerprintAvailable,
  matchesMCPConnectionProvenance,
} from './catalog';
import {
  getMissingRuntimeBodyPlaceholderFields,
  hasRuntimeUrlPlaceholders,
  isUserSourced,
  isOAuthServer,
  requiresEphemeralUserConnection,
  requiresOAuthMachinery,
  shouldDetectRuntimeOAuth,
} from './utils';
import { mcpOptionsContainGraphTokenPlaceholder, preProcessGraphTokens } from '~/utils/graph';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';
import { detectOAuthRequirement, MCPOAuthHandler } from '~/mcp/oauth';
import { ConnectionsRepository } from '~/mcp/ConnectionsRepository';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { isMCPDomainAllowed } from '~/auth/domain';
import { PENDING_STALE_MS } from '~/flow/manager';
import { MCPConnection } from './connection';
import { processMCPEnv } from '~/utils/env';
import { mcpConfig } from './mcpConfig';

type PendingOAuthStart = {
  authURL: string;
  options?: t.OAuthStartOptions;
};

type PendingOAuthState = {
  oauthStarts: Set<t.OAuthStartHandler>;
  emittedAuthUrls: WeakMap<t.OAuthStartHandler, string>;
  primaryOAuthStart?: t.OAuthStartHandler;
  lastOAuthStart?: PendingOAuthStart;
};

type ConnectionScopeContext = Pick<
  t.UserMCPConnectionOptions,
  | 'serverName'
  | 'user'
  | 'customUserVars'
  | 'requestBody'
  | 'graphTokenResolver'
  | 'tokenMethods'
  | 'oboTokenResolver'
  | 'effectiveServerConfig'
  | 'securityPolicy'
  | 'oauthAuthorityScope'
  | 'authorityAuthorizationKind'
> & { userId: string };

type PendingConnection = {
  promise: Promise<MCPConnection>;
  oauth: PendingOAuthState;
  config?: t.ParsedServerConfig;
  context: ConnectionScopeContext;
  authority?: {
    scope: t.MCPToolCatalogScope;
    authorizationKind: t.MCPConnectionProvenance['authorizationKind'];
  };
};

type DetachedConnectionLease = {
  teardown?: Promise<void>;
};

type RequestPendingScope = {
  scope: t.MCPToolCatalogScope;
  authorizationKind: t.MCPConnectionProvenance['authorizationKind'];
};

/**
 * Abstract base class for managing user-specific MCP connections with lifecycle management.
 * Only meant to be extended by MCPManager.
 * Much of the logic was move here from the old MCPManager to make it more manageable.
 * User connections will soon be ephemeral and not cached anymore:
 * https://github.com/danny-avila/LibreChat/discussions/8790
 */
export abstract class UserConnectionManager {
  // Connections shared by all users.
  public appConnections: ConnectionsRepository | null = null;
  // Connections per userId -> serverName -> connection
  protected userConnections: Map<string, Map<string, MCPConnection>> = new Map();
  /** Concurrent force-new results that callers own until explicit or idle cleanup. */
  protected detachedUserConnections: Map<
    string,
    Map<string, Map<MCPConnection, DetachedConnectionLease>>
  > = new Map();

  /** Last activity timestamp for users (not per server) */
  protected userLastActivity: Map<string, number> = new Map();
  /** In-flight connection promises keyed by `userId:serverName` — coalesces concurrent attempts */
  protected pendingConnections: Map<string, PendingConnection> = new Map();
  protected requestPendingScopes: WeakMap<Promise<unknown>, RequestPendingScope> = new WeakMap();

  /** Updates the last activity timestamp for a user */
  protected updateUserLastActivity(userId: string): void {
    const now = Date.now();
    this.userLastActivity.set(userId, now);
    logger.debug(
      `[MCP][User: ${userId}] Updated last activity timestamp: ${new Date(now).toISOString()}`,
    );
  }

  /** Gets or creates a connection for a specific user, coalescing concurrent attempts */
  public async getUserConnection(opts: t.UserMCPConnectionOptions): Promise<MCPConnection> {
    return this.getUserConnectionInternal(opts, false);
  }

  /** Creates a tenant-policy-isolated connection for an otherwise app-owned server. */
  protected async getIsolatedUserConnection(
    opts: t.UserMCPConnectionOptions,
  ): Promise<MCPConnection> {
    return this.getUserConnectionInternal(opts, true);
  }

  private async getUserConnectionInternal(
    opts: t.UserMCPConnectionOptions,
    allowAppLevelServer: boolean,
    returnDetached = false,
  ): Promise<MCPConnection> {
    const { serverName, forceNew, user } = opts;
    const userId = user?.id;
    if (!userId) {
      throw new McpError(ErrorCode.InvalidRequest, `[MCP] User object missing id property`);
    }
    if (!allowAppLevelServer && (await this.appConnections!.has(serverName))) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `[MCP][User: ${userId}] Trying to create user-specific connection for app-level server "${serverName}"`,
      );
    }

    const authorityInputs = [
      opts.effectiveServerConfig,
      opts.securityPolicy,
      opts.oauthAuthorityScope,
      opts.authorityAuthorizationKind,
    ];
    const hasAnyAuthorityInput = authorityInputs.some((value) => value != null);
    const proofBound = opts.serverConfig != null && authorityInputs.every((value) => value != null);
    if (hasAnyAuthorityInput && !proofBound) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `[MCP][User: ${userId}][${serverName}] Incomplete proof-bound connection input.`,
      );
    }
    const config =
      opts.serverConfig ??
      (await MCPServersRegistry.getInstance().getServerConfig(serverName, userId));
    const effectiveServerConfig = opts.effectiveServerConfig;
    const securityPolicy = opts.securityPolicy;
    const oauthAuthorityScope = opts.oauthAuthorityScope;
    const authorityAuthorizationKind = opts.authorityAuthorizationKind;
    const connectionScopeContext: ConnectionScopeContext = {
      userId,
      serverName,
      user,
      customUserVars: opts.customUserVars,
      requestBody: opts.requestBody,
      graphTokenResolver: opts.graphTokenResolver,
      tokenMethods: opts.tokenMethods,
      oboTokenResolver: opts.oboTokenResolver,
      effectiveServerConfig,
      securityPolicy,
      oauthAuthorityScope,
      authorityAuthorizationKind,
    };
    const missingBodyFields = config
      ? getMissingRuntimeBodyPlaceholderFields(config, opts.requestBody)
      : [];
    if (missingBodyFields.length > 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `[MCP][User: ${userId}][${serverName}] Request body field(s) required to resolve runtime MCP placeholders: ${missingBodyFields.join(', ')}.`,
      );
    }
    const ephemeralConnection = config ? requiresEphemeralUserConnection(config) : false;
    const requestScopedConnections = ephemeralConnection
      ? opts.requestScopedConnections
      : undefined;
    if (requestScopedConnections) {
      const requestConnectionKey = `${userId}:${serverName}`;
      const existing = requestScopedConnections.connections.get(requestConnectionKey) as
        | MCPConnection
        | undefined;
      if (existing) {
        if (!config || (config.updatedAt && existing.isStale(config.updatedAt))) {
          await existing.disconnect().catch((error) => {
            logger.warn(
              `[MCP][User: ${userId}][${serverName}] Failed to disconnect stale request-scoped connection`,
              error,
            );
          });
          requestScopedConnections.connections.delete(requestConnectionKey);
        } else if (await existing.isConnected()) {
          const provenanceCurrent =
            !proofBound ||
            (await this.isConnectionProvenanceCurrent(
              existing,
              config,
              connectionScopeContext,
              true,
            ));
          if (provenanceCurrent) {
            logger.debug(`[MCP][User: ${userId}][${serverName}] Reusing request-scoped connection`);
            return existing;
          }
          await existing.disconnect().catch((error) => {
            logger.warn(
              `[MCP][User: ${userId}][${serverName}] Failed to disconnect request-scoped connection with stale authority`,
              error,
            );
          });
          requestScopedConnections.connections.delete(requestConnectionKey);
        } else {
          requestScopedConnections.connections.delete(requestConnectionKey);
        }
      }

      const pending = requestScopedConnections.pending.get(requestConnectionKey) as
        | Promise<MCPConnection>
        | undefined;
      const pendingScope = pending ? this.requestPendingScopes.get(pending) : undefined;
      const pendingMatches = proofBound
        ? pendingScope != null &&
          this.matchesIssuedScope(
            pendingScope.scope,
            pendingScope.authorizationKind,
            oauthAuthorityScope!,
            authorityAuthorizationKind!,
          )
        : true;
      if (pending && pendingMatches) {
        logger.debug(
          `[MCP][User: ${userId}][${serverName}] Joining in-flight request-scoped connection attempt`,
        );
        return pending;
      }

      const pendingOAuth = this.createPendingOAuthState(opts.oauthStart);
      const connectionPromise = this.createUserConnectionInternal(
        {
          ...opts,
          forceNew: true,
          ephemeralConnection: true,
          serverConfig: config,
          oauthStart: this.createPendingOAuthStart(serverName, userId, pendingOAuth),
        },
        userId,
        forceNew === true,
      ).then((connection) => {
        requestScopedConnections.connections.set(requestConnectionKey, connection);
        return connection;
      });

      requestScopedConnections.pending.set(
        requestConnectionKey,
        connectionPromise as Promise<unknown>,
      );
      if (proofBound) {
        this.requestPendingScopes.set(connectionPromise, {
          scope: oauthAuthorityScope!,
          authorizationKind: authorityAuthorizationKind!,
        });
      }

      try {
        return await connectionPromise;
      } finally {
        if (requestScopedConnections.pending.get(requestConnectionKey) === connectionPromise) {
          requestScopedConnections.pending.delete(requestConnectionKey);
        }
      }
    }

    const forceNewConnection = forceNew || ephemeralConnection;
    const clearCooldown = forceNew === true;

    const lockKey = `${userId}:${serverName}`;
    if (!forceNewConnection) {
      const pending = this.pendingConnections.get(lockKey);
      if (pending) {
        let pendingMatches = false;
        if (proofBound) {
          pendingMatches =
            pending.authority != null &&
            this.matchesIssuedScope(
              pending.authority.scope,
              pending.authority.authorizationKind,
              oauthAuthorityScope!,
              authorityAuthorizationKind!,
            );
        } else {
          const [pendingScope, requestedScope] = await Promise.all([
            pending.config
              ? this.resolveCurrentConnectionScope(pending.config, pending.context)
              : null,
            config ? this.resolveCurrentConnectionScope(config, connectionScopeContext) : null,
          ]);
          const pendingProvenance = pendingScope
            ? createMCPConnectionProvenance(pendingScope, 'user')
            : null;
          pendingMatches =
            pendingProvenance != null &&
            requestedScope != null &&
            matchesMCPConnectionProvenance(pendingProvenance, requestedScope);
        }
        if (pendingMatches) {
          logger.debug(
            `[MCP][User: ${userId}][${serverName}] Joining in-flight connection attempt`,
          );
          await this.addPendingOAuthStart(pending.oauth, opts, userId);
          const connection = await pending.promise;
          if (this.userConnections.get(userId)?.get(serverName) !== connection) {
            logger.info(
              `[MCP][User: ${userId}][${serverName}] Joined connection became caller-owned; creating an isolated result`,
            );
            return this.getUserConnectionInternal(
              { ...opts, serverConfig: config, forceNew: true },
              allowAppLevelServer,
              true,
            );
          }
          const provenanceCurrent = await this.isConnectionProvenanceCurrent(
            connection,
            config!,
            connectionScopeContext,
            proofBound,
          );
          if (provenanceCurrent) {
            return connection;
          }
        }
        logger.info(
          `[MCP][User: ${userId}][${serverName}] In-flight connection scope changed; creating an isolated replacement`,
        );
        return this.getUserConnectionInternal(
          { ...opts, serverConfig: config, forceNew: true },
          allowAppLevelServer,
        );
      }
    }

    const pendingOAuth = this.createPendingOAuthState(opts.oauthStart);
    const connectionPromise = this.createUserConnectionInternal(
      {
        ...opts,
        forceNew: forceNewConnection,
        ephemeralConnection,
        serverConfig: config,
        oauthStart: this.createPendingOAuthStart(serverName, userId, pendingOAuth),
      },
      userId,
      clearCooldown,
      returnDetached,
    );

    if (!forceNewConnection) {
      this.pendingConnections.set(lockKey, {
        promise: connectionPromise,
        oauth: pendingOAuth,
        config,
        context: connectionScopeContext,
        authority: proofBound
          ? {
              scope: oauthAuthorityScope!,
              authorizationKind: authorityAuthorizationKind!,
            }
          : undefined,
      });
    }

    try {
      return await connectionPromise;
    } finally {
      if (
        !forceNewConnection &&
        this.pendingConnections.get(lockKey)?.promise === connectionPromise
      ) {
        this.pendingConnections.delete(lockKey);
      }
    }
  }

  private createPendingOAuthState(oauthStart?: t.OAuthStartHandler): PendingOAuthState {
    return {
      oauthStarts: oauthStart ? new Set([oauthStart]) : new Set(),
      emittedAuthUrls: new WeakMap<t.OAuthStartHandler, string>(),
      primaryOAuthStart: oauthStart,
    };
  }

  private createPendingOAuthStart(
    serverName: string,
    userId: string,
    pendingOAuth: PendingOAuthState,
  ): t.OAuthStartHandler {
    return async (authURL, options) => {
      pendingOAuth.lastOAuthStart = { authURL, options };

      let primaryError: unknown;
      const oauthStarts = Array.from(pendingOAuth.oauthStarts);
      for (const oauthStart of oauthStarts) {
        try {
          await this.emitPendingOAuthStart(pendingOAuth, oauthStart, authURL, options);
        } catch (error) {
          if (oauthStart === pendingOAuth.primaryOAuthStart) {
            primaryError = error;
          } else {
            logger.warn(
              `[MCP][User: ${userId}][${serverName}] Failed to notify joined OAuth listener`,
              error,
            );
          }
        }
      }

      if (primaryError) {
        throw primaryError;
      }
    };
  }

  private async addPendingOAuthStart(
    pendingOAuth: PendingOAuthState,
    opts: t.UserMCPConnectionOptions,
    userId: string,
  ): Promise<void> {
    const { oauthStart, serverName } = opts;
    if (typeof oauthStart !== 'function') {
      return;
    }

    pendingOAuth.oauthStarts.add(oauthStart);
    const lastOAuthStart = pendingOAuth.lastOAuthStart;
    if (lastOAuthStart) {
      try {
        const pendingOAuthStart =
          lastOAuthStart.options?.expiresAt == null
            ? await this.getFlowPendingOAuthStart(opts, userId)
            : undefined;
        const replayOAuthStart =
          pendingOAuthStart?.authURL === lastOAuthStart.authURL
            ? pendingOAuthStart
            : lastOAuthStart;
        await this.emitPendingOAuthStart(
          pendingOAuth,
          oauthStart,
          replayOAuthStart.authURL,
          replayOAuthStart.options,
        );
      } catch (error) {
        logger.warn(
          `[MCP][User: ${userId}][${serverName}] Failed to re-issue pending OAuth URL`,
          error,
        );
      }
      return;
    }

    await this.reissuePendingOAuthStart(opts, userId, pendingOAuth);
  }

  private async emitPendingOAuthStart(
    pendingOAuth: PendingOAuthState,
    oauthStart: t.OAuthStartHandler,
    authURL: string,
    options?: t.OAuthStartOptions,
  ): Promise<void> {
    if (pendingOAuth.emittedAuthUrls.get(oauthStart) === authURL) {
      return;
    }
    pendingOAuth.emittedAuthUrls.set(oauthStart, authURL);
    await oauthStart(authURL, options);
  }

  private getPendingOAuthStart(flow: FlowState | null | undefined): PendingOAuthStart | undefined {
    if (flow?.status !== 'PENDING') {
      return undefined;
    }

    const expiresAt = flow.createdAt + PENDING_STALE_MS;
    if (expiresAt <= Date.now()) {
      return undefined;
    }

    const metadata = flow.metadata as MCPOAuthFlowMetadata | undefined;
    const authorizationUrl = metadata?.authorizationUrl;
    if (!authorizationUrl) {
      return undefined;
    }

    return { authURL: authorizationUrl, options: { expiresAt } };
  }

  private async getFlowPendingOAuthStart(
    { flowManager, serverName }: Pick<t.UserMCPConnectionOptions, 'flowManager' | 'serverName'>,
    userId: string,
  ): Promise<PendingOAuthStart | undefined> {
    if (!flowManager) {
      return undefined;
    }

    const flowId = MCPOAuthHandler.generateFlowId(userId, serverName, getTenantId());
    const existingFlow = await flowManager.getFlowState(flowId, 'mcp_oauth');
    return this.getPendingOAuthStart(existingFlow);
  }

  private async reissuePendingOAuthStart(
    { flowManager, oauthStart, serverName }: t.UserMCPConnectionOptions,
    userId: string,
    pendingOAuth?: PendingOAuthState,
  ): Promise<void> {
    if (!flowManager || typeof oauthStart !== 'function') {
      return;
    }

    try {
      const pendingOAuthStart = await this.getFlowPendingOAuthStart(
        { flowManager, serverName },
        userId,
      );
      if (!pendingOAuthStart) {
        return;
      }

      logger.info(
        `[MCP][User: ${userId}][${serverName}] Re-issuing stored authorization URL while joining in-flight connection`,
      );
      if (pendingOAuth) {
        pendingOAuth.lastOAuthStart = pendingOAuthStart;
        await this.emitPendingOAuthStart(
          pendingOAuth,
          oauthStart,
          pendingOAuthStart.authURL,
          pendingOAuthStart.options,
        );
      } else {
        await oauthStart(pendingOAuthStart.authURL, pendingOAuthStart.options);
      }
    } catch (error) {
      logger.warn(
        `[MCP][User: ${userId}][${serverName}] Failed to re-issue pending OAuth URL`,
        error,
      );
    }
  }

  private async createUserConnectionInternal(
    {
      serverName,
      forceNew,
      user,
      flowManager,
      customUserVars,
      requestBody,
      tokenMethods,
      oauthStart,
      oauthEnd,
      oboTokenResolver,
      oboTrustChecker,
      signal,
      returnOnOAuth = false,
      connectionTimeout,
      graphTokenResolver,
      ephemeralConnection = false,
      serverConfig: providedConfig,
      effectiveServerConfig,
      securityPolicy,
      oauthAuthorityScope,
      authorityAuthorizationKind,
      refreshAuthorityLifecycle,
    }: t.UserMCPConnectionOptions,
    userId: string,
    clearCooldown: boolean,
    returnDetached = false,
  ): Promise<MCPConnection> {
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
        `[MCP][User: ${userId}][${serverName}] Incomplete proof-bound connection input.`,
      );
    }
    const config =
      providedConfig ??
      (await MCPServersRegistry.getInstance().getServerConfig(serverName, userId));

    const userServerMap = this.userConnections.get(userId);
    let connection = forceNew ? undefined : userServerMap?.get(serverName);
    if (clearCooldown) {
      MCPConnection.clearCooldown(serverName);
    }
    const now = Date.now();

    // Check if user is idle
    const lastActivity = this.userLastActivity.get(userId);
    if (lastActivity && now - lastActivity > mcpConfig.USER_CONNECTION_IDLE_TIMEOUT) {
      logger.info(`[MCP][User: ${userId}] User idle for too long. Disconnecting all connections.`);
      // Disconnect all user connections
      try {
        await this.disconnectUserConnections(userId);
      } catch (err) {
        logger.error(`[MCP][User: ${userId}] Error disconnecting idle connections:`, err);
      }
      connection = undefined; // Force creation of a new connection
    } else if (connection) {
      if (!config || (config.updatedAt && connection.isStale(config.updatedAt))) {
        if (config) {
          logger.info(
            `[MCP][User: ${userId}][${serverName}] Config was updated, disconnecting stale connection`,
          );
        }
        await this.disconnectUserConnection(userId, serverName, connection);
        connection = undefined;
      } else if (await connection.isConnected()) {
        const provenanceCurrent = await this.isConnectionProvenanceCurrent(
          connection,
          config,
          {
            userId,
            serverName,
            user,
            customUserVars,
            requestBody,
            graphTokenResolver,
            tokenMethods,
            oboTokenResolver,
            effectiveServerConfig,
            securityPolicy,
            oauthAuthorityScope,
            authorityAuthorizationKind,
          },
          proofBound,
        );
        if (provenanceCurrent) {
          logger.debug(`[MCP][User: ${userId}][${serverName}] Reusing active connection`);
          this.updateUserLastActivity(userId);
          return connection;
        }
        logger.info(
          `[MCP][User: ${userId}][${serverName}] Connection scope changed, disconnecting stale connection`,
        );
        await this.disconnectUserConnection(userId, serverName, connection);
        connection = undefined;
      } else {
        // Connection exists but is not connected, attempt to remove potentially stale entry
        logger.warn(
          `[MCP][User: ${userId}][${serverName}] Found existing but disconnected connection object. Cleaning up.`,
        );
        this.removeUserConnection(userId, serverName); // Clean up maps
        connection = undefined;
      }
    }

    // Now check if config exists for new connection creation
    if (!config) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `[MCP][User: ${userId}] Configuration for server "${serverName}" not found.`,
      );
    }

    // If no valid connection exists, create a new one
    logger.info(`[MCP][User: ${userId}][${serverName}] Establishing new connection`);
    const connectionToReplace = this.userConnections.get(userId)?.get(serverName);

    try {
      const {
        runtimeConfig,
        useSSRFProtection,
        allowedDomains,
        allowedAddresses,
        proofBound: usesIssuedRuntime,
      } = await this.resolveConnectionRuntimeInput({
        config,
        user,
        customUserVars,
        requestBody,
        graphTokenResolver,
        effectiveServerConfig,
        securityPolicy,
      });
      const basic: t.BasicConnectionOptions = {
        serverConfig: runtimeConfig,
        declarativeServerConfig: usesIssuedRuntime ? config : undefined,
        serverName: serverName,
        dbSourced: isUserSourced(config),
        skipEnvProcessing: usesIssuedRuntime,
        useSSRFProtection,
        allowedDomains,
        allowedAddresses,
        ephemeralConnection,
      };

      const useOAuth = requiresOAuthMachinery(runtimeConfig);
      let connectionOptions: t.OAuthConnectionOptions | t.UserConnectionContext;
      if (useOAuth) {
        if (!flowManager) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `[MCP][User: ${userId}] OAuth server "${serverName}" requires a flowManager`,
          );
        }

        connectionOptions = {
          useOAuth: true,
          user: user,
          customUserVars: customUserVars,
          flowManager: flowManager,
          tokenMethods: tokenMethods,
          signal: signal,
          oauthStart: oauthStart,
          oauthEnd: oauthEnd,
          oboTokenResolver: oboTokenResolver,
          oboTrustChecker: oboTrustChecker,
          graphTokenResolver,
          returnOnOAuth: returnOnOAuth,
          requestBody: requestBody,
          connectionTimeout: connectionTimeout,
          oauthAuthorityScope,
          authorityAuthorizationKind,
          refreshAuthorityLifecycle,
          effectiveServerConfig,
          securityPolicy,
        };
      } else {
        connectionOptions = {
          user,
          customUserVars,
          requestBody,
          graphTokenResolver,
          connectionTimeout,
          oauthAuthorityScope,
          authorityAuthorizationKind,
          refreshAuthorityLifecycle,
          effectiveServerConfig,
          securityPolicy,
        };
      }

      connection = await MCPConnectionFactory.create(basic, connectionOptions);

      if (!(await connection?.isConnected())) {
        throw new Error('Failed to establish connection after initialization attempt.');
      }

      if (!ephemeralConnection) {
        if (returnDetached) {
          this.trackDetachedUserConnection(userId, serverName, connection);
        } else {
          await this.trackUserConnection(userId, serverName, connection, connectionToReplace);
        }
      }

      logger.info(`[MCP][User: ${userId}][${serverName}] Connection successfully established`);
      if (!ephemeralConnection) {
        this.updateUserLastActivity(userId);
      }
      return connection;
    } catch (error) {
      logger.error(`[MCP][User: ${userId}][${serverName}] Failed to establish connection`, error);
      // Ensure partial connection state is cleaned up if initialization fails
      await connection?.disconnect().catch((disconnectError) => {
        logger.error(
          `[MCP][User: ${userId}][${serverName}] Error during cleanup after failed connection`,
          disconnectError,
        );
      });
      if (connection) {
        this.removeUserConnectionIfOwned(userId, serverName, connection);
      }
      throw error; // Re-throw the error to the caller
    }
  }

  private async resolveCurrentConnectionScope(
    config: t.ParsedServerConfig,
    context: ConnectionScopeContext,
    discoveryProvenance?: t.MCPConnectionProvenance | null,
  ): Promise<MCPToolCatalogScopeInput | null> {
    if (!isMCPToolCatalogFingerprintAvailable()) {
      return null;
    }
    const {
      userId,
      serverName,
      user,
      customUserVars,
      requestBody,
      graphTokenResolver,
      tokenMethods,
      oboTokenResolver,
    } = context;
    const runtimeOAuthDetected =
      discoveryProvenance?.authorizationKind === 'oauth' && shouldDetectRuntimeOAuth(config);
    const provenanceServerConfig = runtimeOAuthDetected
      ? { ...config, requiresOAuth: true }
      : config;
    const configuredOAuth = isOAuthServer(provenanceServerConfig);
    if (configuredOAuth && !tokenMethods?.findToken) {
      return null;
    }
    const batchTokenMethods = tokenMethods as
      | { findTokens?: MCPAuthorizationTokenBatchFinder }
      | undefined;
    const usesObo = config.obo != null && oboTokenResolver != null && user != null;
    let authorizationIdentity: string | null = 'none';
    if (usesObo) {
      authorizationIdentity = MCP_OBO_CONNECTION_AUTHORIZATION_IDENTITY;
    } else if (configuredOAuth) {
      authorizationIdentity = await getMCPAuthorizationIdentity({
        userId,
        serverName,
        findToken: tokenMethods!.findToken!,
        findTokens: batchTokenMethods?.findTokens,
      });
    }
    if (authorizationIdentity == null) {
      return null;
    }
    const registry = MCPServersRegistry.getInstance();
    const { allowedDomains, allowedAddresses } = await registry.resolveAllowlists({
      userId,
      role: user?.role,
      tenantId: user?.tenantId ?? getTenantId() ?? null,
    });
    const effectiveServerConfig = await this.resolveRuntimeConfig({
      config: provenanceServerConfig,
      user,
      customUserVars,
      requestBody,
      graphTokenResolver,
    });
    return {
      tenantId: user?.tenantId ?? getTenantId() ?? null,
      userId,
      serverName,
      serverConfig: provenanceServerConfig,
      effectiveServerConfig,
      securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
        allowedDomains,
        allowedAddresses,
      }),
      customUserVars,
      authorizationIdentity,
    };
  }

  private async isConnectionProvenanceCurrent(
    connection: MCPConnection,
    config: t.ParsedServerConfig,
    context: ConnectionScopeContext,
    proofBound = false,
  ): Promise<boolean> {
    const provenance = connection.getDiscoveryProvenance();
    if (proofBound) {
      const scope = context.oauthAuthorityScope;
      const authorizationKind = context.authorityAuthorizationKind;
      return (
        provenance != null &&
        scope != null &&
        authorizationKind != null &&
        this.matchesIssuedScope(
          provenance.scope,
          provenance.authorizationKind,
          scope,
          authorizationKind,
        )
      );
    }
    if (!isMCPToolCatalogFingerprintAvailable()) {
      return true;
    }
    const scope = await this.resolveCurrentConnectionScope(config, context, provenance);
    return scope != null && matchesMCPConnectionProvenance(provenance, scope);
  }

  private matchesIssuedScope(
    left: t.MCPToolCatalogScope,
    leftAuthorizationKind: t.MCPConnectionProvenance['authorizationKind'],
    right: t.MCPToolCatalogScope,
    rightAuthorizationKind: t.MCPConnectionProvenance['authorizationKind'],
  ): boolean {
    return (
      leftAuthorizationKind === rightAuthorizationKind &&
      left.tenant === right.tenant &&
      left.principal === right.principal &&
      left.server === right.server &&
      left.policy === right.policy &&
      left.config === right.config &&
      left.credentials === right.credentials
    );
  }

  /**
   * Mirrors the resolution MCPConnectionFactory performs internally
   * (preProcessGraphTokens + processMCPEnv). Both must stay in sync so the
   * config validated here matches the one the factory actually connects with.
   */
  protected async resolveRuntimeConfig({
    config,
    user,
    customUserVars,
    requestBody,
    graphTokenResolver,
  }: {
    config: t.ParsedServerConfig;
    user?: t.UserMCPConnectionOptions['user'];
    customUserVars?: Record<string, string>;
    requestBody?: t.UserMCPConnectionOptions['requestBody'];
    graphTokenResolver?: t.UserMCPConnectionOptions['graphTokenResolver'];
  }): Promise<t.ParsedServerConfig> {
    const dbSourced = isUserSourced(config);
    const graphProcessedConfig = dbSourced
      ? config
      : await preProcessGraphTokens(config, {
          user,
          graphTokenResolver,
          scopes: process.env.GRAPH_API_SCOPES,
        });

    return processMCPEnv({
      user,
      body: requestBody,
      dbSourced,
      options: graphProcessedConfig,
      customUserVars,
    }) as t.ParsedServerConfig;
  }

  protected async assertResolvedRuntimeConfigAllowed({
    config,
    user,
    customUserVars,
    requestBody,
    graphTokenResolver,
    allowedDomains,
    allowedAddresses,
    logPrefix,
  }: {
    config: t.ParsedServerConfig;
    user?: t.UserMCPConnectionOptions['user'];
    customUserVars?: Record<string, string>;
    requestBody?: t.UserMCPConnectionOptions['requestBody'];
    graphTokenResolver?: t.UserMCPConnectionOptions['graphTokenResolver'];
    allowedDomains?: string[] | null;
    allowedAddresses?: string[] | null;
    logPrefix: string;
  }): Promise<t.ParsedServerConfig> {
    const resolvedConfig = await this.resolveRuntimeConfig({
      config,
      user,
      customUserVars,
      requestBody,
      graphTokenResolver,
    });

    if (!resolvedConfig.url) {
      return resolvedConfig;
    }

    if (hasRuntimeUrlPlaceholders(resolvedConfig)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `${logPrefix} Runtime URL still contains unresolved MCP placeholders after resolution.`,
      );
    }

    const allowed = await isMCPDomainAllowed(resolvedConfig, allowedDomains, allowedAddresses);
    if (!allowed) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `${logPrefix} Resolved MCP server URL is not allowed by the configured domain policy.`,
      );
    }

    return resolvedConfig;
  }

  protected async assertExactRuntimeConfigAllowed({
    effectiveConfig,
    securityPolicy,
    logPrefix,
  }: {
    effectiveConfig: t.ParsedServerConfig;
    securityPolicy: NonNullable<t.UserConnectionContext['securityPolicy']>;
    logPrefix: string;
  }): Promise<void> {
    if (mcpOptionsContainGraphTokenPlaceholder(effectiveConfig)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `${logPrefix} Graph credentials were not materialized by the MCP authority resolver.`,
      );
    }
    if (!effectiveConfig.url) {
      return;
    }
    if (hasRuntimeUrlPlaceholders(effectiveConfig)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `${logPrefix} Runtime URL still contains unresolved MCP placeholders after resolution.`,
      );
    }
    if (
      !(await isMCPDomainAllowed(
        effectiveConfig,
        securityPolicy.allowedDomains,
        securityPolicy.allowedAddresses,
      ))
    ) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `${logPrefix} Resolved MCP server URL is not allowed by the configured domain policy.`,
      );
    }
  }

  private async resolveConnectionRuntimeInput({
    config,
    user,
    customUserVars,
    requestBody,
    graphTokenResolver,
    effectiveServerConfig,
    securityPolicy,
  }: {
    config: t.ParsedServerConfig;
    user?: t.UserMCPConnectionOptions['user'];
    customUserVars?: Record<string, string>;
    requestBody?: t.UserMCPConnectionOptions['requestBody'];
    graphTokenResolver?: t.UserMCPConnectionOptions['graphTokenResolver'];
    effectiveServerConfig?: t.ParsedServerConfig;
    securityPolicy?: t.UserConnectionContext['securityPolicy'];
  }): Promise<{
    runtimeConfig: t.MCPOptions;
    useSSRFProtection: boolean;
    allowedDomains?: string[] | null;
    allowedAddresses?: string[] | null;
    proofBound: boolean;
  }> {
    if (effectiveServerConfig && securityPolicy) {
      await this.assertExactRuntimeConfigAllowed({
        effectiveConfig: effectiveServerConfig,
        securityPolicy,
        logPrefix: `[MCP][User: ${user?.id}][${config.url}]`,
      });
      return {
        runtimeConfig: effectiveServerConfig,
        useSSRFProtection: securityPolicy.useSSRFProtection,
        allowedDomains: securityPolicy.allowedDomains,
        allowedAddresses: securityPolicy.allowedAddresses,
        proofBound: true,
      };
    }

    const runtimeConfig = await this.applyRuntimeOAuthDetection({
      config,
      user,
      customUserVars,
      requestBody,
      graphTokenResolver,
    });
    const registry = MCPServersRegistry.getInstance();
    const { allowedDomains, allowedAddresses, useSSRFProtection } =
      await registry.resolveAllowlists({
        userId: user?.id,
        role: user?.role,
        tenantId: user?.tenantId ?? getTenantId() ?? null,
      });
    await this.assertResolvedRuntimeConfigAllowed({
      config: runtimeConfig,
      user,
      customUserVars,
      requestBody,
      graphTokenResolver,
      allowedDomains,
      allowedAddresses,
      logPrefix: `[MCP][User: ${user?.id}][${config.url}]`,
    });
    return {
      runtimeConfig,
      useSSRFProtection,
      allowedDomains,
      allowedAddresses,
      proofBound: false,
    };
  }

  private async applyRuntimeOAuthDetection({
    config,
    user,
    customUserVars,
    requestBody,
    graphTokenResolver,
  }: {
    config: t.ParsedServerConfig;
    user?: t.UserMCPConnectionOptions['user'];
    customUserVars?: Record<string, string>;
    requestBody?: t.UserMCPConnectionOptions['requestBody'];
    graphTokenResolver?: t.UserMCPConnectionOptions['graphTokenResolver'];
  }): Promise<t.ParsedServerConfig> {
    if (!shouldDetectRuntimeOAuth(config)) {
      return config;
    }

    const resolvedConfig = await this.resolveRuntimeConfig({
      config,
      user,
      customUserVars,
      requestBody,
      graphTokenResolver,
    });

    if (!resolvedConfig.url || hasRuntimeUrlPlaceholders(resolvedConfig)) {
      logger.warn(
        `[MCP][User: ${user?.id}][${config.url}] Runtime URL still contains placeholders after resolution; skipping OAuth detection`,
      );
      return config;
    }

    const registry = MCPServersRegistry.getInstance();
    const { allowedDomains, allowedAddresses } = await registry.resolveAllowlists({
      userId: user?.id,
      role: user?.role,
      tenantId: user?.tenantId ?? getTenantId() ?? null,
    });
    const allowed = await isMCPDomainAllowed(resolvedConfig, allowedDomains, allowedAddresses);
    if (!allowed) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `[MCP][User: ${user?.id}][${config.url}] Resolved MCP server URL is not allowed by the configured domain policy.`,
      );
    }

    const result = await detectOAuthRequirement(
      resolvedConfig.url,
      allowedDomains,
      allowedAddresses,
    );

    return {
      ...config,
      requiresOAuth: result.requiresOAuth,
      oauthMetadata: result.metadata,
    };
  }

  /** Returns all connections for a specific user */
  public getUserConnections(userId: string): Map<string, MCPConnection> | undefined {
    return this.userConnections.get(userId);
  }

  /** Removes a specific user connection entry */
  protected removeUserConnection(userId: string, serverName: string): void {
    const userMap = this.userConnections.get(userId);
    if (userMap) {
      userMap.delete(serverName);
      if (userMap.size === 0) {
        this.userConnections.delete(userId);
        if (!this.detachedUserConnections.has(userId)) {
          this.userLastActivity.delete(userId);
        }
      }
    }

    logger.debug(`[MCP][User: ${userId}][${serverName}] Removed connection entry.`);
  }

  private removeUserConnectionIfOwned(
    userId: string,
    serverName: string,
    connection: MCPConnection,
  ): void {
    if (this.userConnections.get(userId)?.get(serverName) !== connection) {
      return;
    }
    this.removeUserConnection(userId, serverName);
  }

  private trackDetachedUserConnection(
    userId: string,
    serverName: string,
    connection: MCPConnection,
  ): void {
    let serverMap = this.detachedUserConnections.get(userId);
    if (!serverMap) {
      serverMap = new Map();
      this.detachedUserConnections.set(userId, serverMap);
    }
    let connections = serverMap.get(serverName);
    if (!connections) {
      connections = new Map();
      serverMap.set(serverName, connections);
    }
    connections.set(connection, {});
  }

  private removeDetachedUserConnection(
    userId: string,
    serverName: string,
    connection: MCPConnection,
    expectedLease?: DetachedConnectionLease,
  ): void {
    const serverMap = this.detachedUserConnections.get(userId);
    if (!serverMap) {
      return;
    }
    const connections = serverMap.get(serverName);
    if (!connections) {
      return;
    }
    const lease = connections.get(connection);
    if (!lease || (expectedLease && lease !== expectedLease)) {
      return;
    }
    connections.delete(connection);
    if (connections.size === 0) {
      serverMap.delete(serverName);
    }
    if (serverMap.size === 0) {
      this.detachedUserConnections.delete(userId);
      if (!this.userConnections.has(userId)) {
        this.userLastActivity.delete(userId);
      }
    }
  }

  /** Releases a concurrent force-new result without disturbing the connection that owns the slot. */
  public async releaseDetachedUserConnection(
    userId: string,
    serverName: string,
    connection: MCPConnection,
  ): Promise<boolean> {
    return this.closeDetachedUserConnection(userId, serverName, connection);
  }

  private async closeDetachedUserConnection(
    userId: string,
    serverName: string,
    connection: MCPConnection,
  ): Promise<boolean> {
    const lease = this.detachedUserConnections.get(userId)?.get(serverName)?.get(connection);
    if (!lease) {
      return false;
    }
    if (lease.teardown) {
      await lease.teardown;
      return true;
    }
    const teardown = connection.disconnect();
    lease.teardown = teardown;
    try {
      await teardown;
      this.removeDetachedUserConnection(userId, serverName, connection, lease);
      return true;
    } catch (error) {
      if (lease.teardown === teardown) {
        lease.teardown = undefined;
      }
      throw error;
    }
  }

  private async trackUserConnection(
    userId: string,
    serverName: string,
    connection: MCPConnection,
    expectedConnection?: MCPConnection,
  ): Promise<void> {
    let userMap = this.userConnections.get(userId);
    if (!userMap) {
      userMap = new Map();
      this.userConnections.set(userId, userMap);
    }
    const displacedConnection = userMap.get(serverName);
    if (displacedConnection !== expectedConnection) {
      this.trackDetachedUserConnection(userId, serverName, connection);
      logger.info(
        `[MCP][User: ${userId}][${serverName}] Returning concurrent scoped connection with detached lifecycle`,
      );
      return;
    }
    userMap.set(serverName, connection);
    if (!displacedConnection || displacedConnection === connection) {
      return;
    }
    try {
      await displacedConnection.disconnect();
    } catch (error) {
      logger.warn(
        `[MCP][User: ${userId}][${serverName}] Failed to disconnect displaced scoped connection`,
        error,
      );
    }
  }

  /** Disconnects and removes a specific user connection. */
  public async disconnectUserConnection(
    userId: string,
    serverName: string,
    expectedConnection?: MCPConnection,
  ): Promise<void> {
    const userMap = this.userConnections.get(userId);
    const connection = userMap?.get(serverName);
    if (expectedConnection && connection !== expectedConnection) {
      await this.closeDetachedUserConnection(userId, serverName, expectedConnection);
      return;
    }
    if (!expectedConnection) {
      this.pendingConnections.delete(`${userId}:${serverName}`);
    }
    if (connection) {
      logger.info(`[MCP][User: ${userId}][${serverName}] Disconnecting...`);
      await connection.disconnect();
      this.removeUserConnectionIfOwned(userId, serverName, connection);
    }
    if (expectedConnection) {
      return;
    }
    const detachedConnections = Array.from(
      this.detachedUserConnections.get(userId)?.get(serverName)?.keys() ?? [],
    );
    for (const detachedConnection of detachedConnections) {
      await this.closeDetachedUserConnection(userId, serverName, detachedConnection);
    }
  }

  /** Disconnects only the connection that produced the rejected discovery result. */
  public async disconnectUserConnectionIfProvenanceMatches(
    userId: string,
    serverName: string,
    expectedProvenance: t.MCPConnectionProvenance | null,
  ): Promise<void> {
    const connection = this.userConnections.get(userId)?.get(serverName);
    const currentProvenance = connection?.getDiscoveryProvenance() ?? null;
    if (!connection || !this.hasSameConnectionProvenance(currentProvenance, expectedProvenance)) {
      return;
    }
    await this.disconnectUserConnection(userId, serverName, connection);
  }

  private hasSameConnectionProvenance(
    left: t.MCPConnectionProvenance | null,
    right: t.MCPConnectionProvenance | null,
  ): boolean {
    return (
      left != null &&
      right != null &&
      left.version === right.version &&
      left.principalKind === right.principalKind &&
      left.authorizationKind === right.authorizationKind &&
      left.scope.tenant === right.scope.tenant &&
      left.scope.principal === right.scope.principal &&
      left.scope.server === right.scope.server &&
      left.scope.policy === right.scope.policy &&
      left.scope.config === right.scope.config &&
      left.scope.credentials === right.scope.credentials
    );
  }

  /** Disconnects and removes all connections for a specific user */
  public async disconnectUserConnections(userId: string): Promise<void> {
    const userMap = this.userConnections.get(userId);
    const detachedServerMap = this.detachedUserConnections.get(userId);
    const disconnectPromises: Promise<void>[] = [];
    if (userMap || detachedServerMap) {
      logger.info(`[MCP][User: ${userId}] Disconnecting all servers...`);
      const userServers = new Set([
        ...(userMap?.keys() ?? []),
        ...(detachedServerMap?.keys() ?? []),
      ]);
      for (const serverName of userServers) {
        disconnectPromises.push(
          this.disconnectUserConnection(userId, serverName).catch((error) => {
            logger.error(
              `[MCP][User: ${userId}][${serverName}] Error during disconnection:`,
              error,
            );
          }),
        );
      }
      await Promise.allSettled(disconnectPromises);
      // Clean up any pending connection promises for this user
      for (const key of this.pendingConnections.keys()) {
        if (key.startsWith(`${userId}:`)) {
          this.pendingConnections.delete(key);
        }
      }
      logger.info(`[MCP][User: ${userId}] All connections processed for disconnection.`);
    }
    /**
     * Always clear the activity timestamp, even when userMap was missing.
     * `updateUserLastActivity` can be called before a connection is established
     * (e.g. in MCPManager.callTool prior to getConnection); if that connection
     * attempt fails, the activity entry would otherwise leak and trigger the
     * idle check repeatedly for the same userId.
     */
    this.userLastActivity.delete(userId);
  }

  /** Check for and disconnect idle connections */
  protected checkIdleConnections(currentUserId?: string): void {
    const now = Date.now();

    // Iterate through all users to check for idle ones
    for (const [userId, lastActivity] of this.userLastActivity.entries()) {
      if (currentUserId && currentUserId === userId) {
        continue;
      }
      if (now - lastActivity > mcpConfig.USER_CONNECTION_IDLE_TIMEOUT) {
        logger.info(
          `[MCP][User: ${userId}] User idle for too long. Disconnecting all connections...`,
        );
        // Disconnect all user connections asynchronously (fire and forget)
        this.disconnectUserConnections(userId).catch((err) =>
          logger.error(`[MCP][User: ${userId}] Error disconnecting idle connections:`, err),
        );
      }
    }
  }

  /** Returns counts of tracked users and connections for diagnostics */
  public getConnectionStats(): {
    trackedUsers: number;
    totalConnections: number;
    activityEntries: number;
    appConnectionCount: number;
  } {
    let totalConnections = 0;
    for (const serverMap of this.userConnections.values()) {
      totalConnections += serverMap.size;
    }
    for (const serverMap of this.detachedUserConnections.values()) {
      for (const connections of serverMap.values()) {
        totalConnections += connections.size;
      }
    }
    return {
      trackedUsers: new Set([
        ...this.userConnections.keys(),
        ...this.detachedUserConnections.keys(),
      ]).size,
      totalConnections,
      activityEntries: this.userLastActivity.size,
      appConnectionCount: this.appConnections?.getConnectionCount() ?? 0,
    };
  }
}
