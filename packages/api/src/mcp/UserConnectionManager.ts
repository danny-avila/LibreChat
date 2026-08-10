import { logger, getTenantId } from '@librechat/data-schemas';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { MCPAuthorizationTokenBatchFinder, MCPToolCatalogScopeInput } from './catalog';
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
import {
  cancelMCPToolsChanged,
  getMCPAppToolsPublicationGeneration,
  getMCPToolsChangedGeneration,
  notifyMCPToolsChanged,
  renewMCPToolsChangedGeneration,
} from './toolsChanged';
import { mcpOptionsContainGraphTokenPlaceholder, preProcessGraphTokens } from '~/utils/graph';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';
import { ConnectionsRepository } from '~/mcp/ConnectionsRepository';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { processMCPEnv, isPluginSourced } from '~/utils/env';
import { OAuthLifecycleRelay } from '~/mcp/oauth/pending';
import { detectOAuthRequirement } from '~/mcp/oauth';
import { isMCPDomainAllowed } from '~/auth/domain';
import { MCPConnection } from './connection';
import { mcpConfig } from './mcpConfig';

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
  oauth: OAuthLifecycleRelay;
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

type ConnectionCreationGuard = { cancelled: boolean };

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
  private readonly connectionBorrowers = new WeakMap<MCPConnection, number>();
  private readonly connectionBorrowerDrainWaiters = new WeakMap<MCPConnection, Set<() => void>>();
  private readonly deferredConnectionDisposalHolds = new WeakMap<MCPConnection, number>();
  private readonly deferredConnectionDisposals = new WeakMap<MCPConnection, string>();
  /** All durable creations, including forced replacements, visible to mutation teardown. */
  private readonly activeConnectionCreations: Map<string, Set<ConnectionCreationGuard>> = new Map();
  /** Serializes explicit durable replacements without coalescing their callers. */
  private readonly forceNewConnectionQueues: Map<string, Promise<void>> = new Map();
  /** Fences durable connections whose credentials were invalidated on another replica. */
  protected readonly toolPublicationGenerations: WeakMap<MCPConnection, string> = new WeakMap();
  /** Binds a durable connection to the stored config that created it, independently of Redis. */
  protected readonly toolConfigGenerations: WeakMap<MCPConnection, string> = new WeakMap();
  /** Limits Redis lease refreshes while ensuring active connections cannot outlive their lease. */
  private readonly toolPublicationLeaseRefreshes: WeakMap<MCPConnection, number> = new WeakMap();
  /** Coalesces concurrent activity updates for the same durable connection. */
  private readonly toolPublicationLeaseRenewals: WeakMap<MCPConnection, Promise<void>> =
    new WeakMap();

  /** Records connections whose distributed publication authority was replaced during renewal. */
  private readonly lostToolPublicationLeases: WeakSet<MCPConnection> = new WeakSet();

  /** Returns the cache-publication generation captured for a durable connection. */
  public getToolPublicationGeneration(connection: MCPConnection): string | undefined {
    return this.toolPublicationGenerations.get(connection);
  }

  /** Returns the config identity captured when a durable connection was created. */
  public getToolConfigGeneration(connection: MCPConnection): string | undefined {
    return this.toolConfigGenerations.get(connection);
  }

  private runWithForceNewConnectionQueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.forceNewConnectionQueues.get(key) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.forceNewConnectionQueues.set(key, tail);
    void tail.then(() => {
      if (this.forceNewConnectionQueues.get(key) === tail) {
        this.forceNewConnectionQueues.delete(key);
      }
    });
    return result;
  }

  private getConnectionCreationQueueKey(
    lockKey: string,
    scope?: t.MCPToolCatalogScope | null,
    authorizationKind?: t.MCPConnectionProvenance['authorizationKind'],
  ): string {
    if (!scope || !authorizationKind) {
      return lockKey;
    }
    return [
      lockKey,
      authorizationKind,
      scope.tenant,
      scope.principal,
      scope.server,
      scope.policy,
      scope.config,
      scope.credentials,
    ].join(':');
  }

  private async disposeConnection(connection: MCPConnection): Promise<void> {
    connection.removeAllListeners?.('toolsChanged');
    const teardown = connection.dispose?.() ?? connection.disconnect();
    await teardown;
  }

  private registerConnectionCreation(key: string, guard: ConnectionCreationGuard): void {
    const guards = this.activeConnectionCreations.get(key) ?? new Set<ConnectionCreationGuard>();
    guards.add(guard);
    this.activeConnectionCreations.set(key, guards);
  }

  private unregisterConnectionCreation(key: string, guard: ConnectionCreationGuard): void {
    const guards = this.activeConnectionCreations.get(key);
    guards?.delete(guard);
    if (guards?.size === 0) {
      this.activeConnectionCreations.delete(key);
    }
  }

  private cancelConnectionCreations(key: string, preserved?: ConnectionCreationGuard): void {
    for (const guard of this.activeConnectionCreations.get(key) ?? []) {
      if (guard !== preserved) {
        guard.cancelled = true;
      }
    }
  }

  private async renewUserToolPublicationLeases(userId: string, now: number): Promise<void> {
    const userConnections = this.userConnections.get(userId);
    if (!userConnections) {
      return;
    }
    const configuredIdleTimeout = Number(mcpConfig.USER_CONNECTION_IDLE_TIMEOUT);
    const refreshInterval =
      Number.isFinite(configuredIdleTimeout) && configuredIdleTimeout > 0
        ? Math.max(1_000, configuredIdleTimeout / 2)
        : 15 * 60 * 1000;
    const renewals: Promise<void>[] = [];
    for (const [serverName, connection] of userConnections) {
      const publicationGeneration = this.toolPublicationGenerations.get(connection);
      if (!publicationGeneration) {
        continue;
      }
      const lastRefresh = this.toolPublicationLeaseRefreshes.get(connection) ?? 0;
      if (now - lastRefresh < refreshInterval) {
        continue;
      }
      const pendingRenewal = this.toolPublicationLeaseRenewals.get(connection);
      if (pendingRenewal) {
        renewals.push(pendingRenewal);
        continue;
      }
      const renewal = renewMCPToolsChangedGeneration({
        userId,
        serverName,
        publicationGeneration,
      })
        .then((renewed) => {
          if (renewed === true) {
            this.toolPublicationLeaseRefreshes.set(connection, now);
          } else if (renewed === false) {
            this.lostToolPublicationLeases.add(connection);
            logger.info(
              `[MCP][User: ${userId}][${serverName}] Publication lease is no longer current`,
            );
          }
        })
        .catch((error) => {
          logger.warn(
            `[MCP][User: ${userId}][${serverName}] Failed to renew tool publication lease`,
            error,
          );
        });
      this.toolPublicationLeaseRenewals.set(connection, renewal);
      void renewal.finally(() => {
        if (this.toolPublicationLeaseRenewals.get(connection) === renewal) {
          this.toolPublicationLeaseRenewals.delete(connection);
        }
      });
      renewals.push(renewal);
    }
    await Promise.all(renewals);
  }

  /** Updates activity and keeps every durable connection retained by that user leased. */
  protected async updateUserLastActivity(userId: string): Promise<void> {
    const now = Date.now();
    this.userLastActivity.set(userId, now);
    logger.debug(
      `[MCP][User: ${userId}] Updated last activity timestamp: ${new Date(now).toISOString()}`,
    );
    await this.renewUserToolPublicationLeases(userId, now);
  }

  private async assertToolPublicationLeaseCurrent(
    connection: MCPConnection,
    userId: string,
    serverName: string,
    creationGuard?: ConnectionCreationGuard,
  ): Promise<void> {
    if (!this.lostToolPublicationLeases.has(connection)) {
      return;
    }
    await this.disconnectUserConnection(userId, serverName, undefined, creationGuard);
    throw new Error(`[MCP][User: ${userId}][${serverName}] Publication lease is no longer current`);
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
    creationScope?: RequestPendingScope,
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
      this.bindRequestScopedConnectionStore(requestScopedConnections);
      const requestConnectionKey = `${userId}:${serverName}`;
      const existing = requestScopedConnections.connections.get(requestConnectionKey) as
        | MCPConnection
        | undefined;
      if (existing) {
        if (!config || (config.updatedAt && existing.isStale(config.updatedAt))) {
          requestScopedConnections.connections.delete(requestConnectionKey);
          await this.disposeEvictedConnection(existing, `[MCP][User: ${userId}][${serverName}]`);
        } else {
          const activeRecovery = this.getActiveConnectionRecovery(existing);
          let awaitedRecovery = activeRecovery;
          if (activeRecovery) {
            await this.waitForConnectionRecovery(activeRecovery, opts.signal);
          }
          let connected = await existing.isConnected();
          let recovery = this.getActiveConnectionRecovery(existing);
          while (recovery && recovery !== awaitedRecovery) {
            awaitedRecovery = recovery;
            await this.waitForConnectionRecovery(recovery, opts.signal);
            connected = await existing.isConnected();
            recovery = this.getActiveConnectionRecovery(existing);
          }
          if (connected) {
            const provenanceCurrent =
              !proofBound ||
              (await this.isConnectionProvenanceCurrent(
                existing,
                config,
                connectionScopeContext,
                true,
              ));
            if (provenanceCurrent) {
              logger.debug(
                `[MCP][User: ${userId}][${serverName}] Reusing request-scoped connection`,
              );
              return existing;
            }
          }
          requestScopedConnections.connections.delete(requestConnectionKey);
          await this.disposeEvictedConnection(existing, `[MCP][User: ${userId}][${serverName}]`);
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

      const pendingOAuth = new OAuthLifecycleRelay({
        oauthStart: opts.oauthStart,
        oauthEnd: opts.oauthEnd,
        logPrefix: `[MCP][User: ${userId}][${serverName}]`,
      });
      const connectionPromise = this.createUserConnectionInternal(
        {
          ...opts,
          forceNew: true,
          ephemeralConnection: true,
          serverConfig: config,
          oauthStart: pendingOAuth.start,
          oauthEnd: pendingOAuth.end,
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
        let requestedCreationScope = proofBound
          ? {
              scope: oauthAuthorityScope!,
              authorizationKind: authorityAuthorizationKind!,
            }
          : undefined;
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
          const requestedProvenance = requestedScope
            ? createMCPConnectionProvenance(requestedScope, 'user')
            : null;
          requestedCreationScope = requestedProvenance
            ? {
                scope: requestedProvenance.scope,
                authorizationKind: requestedProvenance.authorizationKind,
              }
            : undefined;
          pendingMatches =
            pendingProvenance != null &&
            requestedScope != null &&
            matchesMCPConnectionProvenance(pendingProvenance, requestedScope);
        }
        if (pendingMatches) {
          logger.debug(
            `[MCP][User: ${userId}][${serverName}] Joining in-flight connection attempt`,
          );
          await pending.oauth.add({
            oauthStart: opts.oauthStart,
            oauthEnd: opts.oauthEnd,
            flowManager: opts.flowManager,
            userId,
            serverName,
          });
          const connection = await pending.promise;
          if (this.userConnections.get(userId)?.get(serverName) !== connection) {
            logger.info(
              `[MCP][User: ${userId}][${serverName}] Joined connection became caller-owned; creating an isolated result`,
            );
            return this.getUserConnectionInternal(
              { ...opts, serverConfig: config, forceNew: true },
              allowAppLevelServer,
              true,
              requestedCreationScope,
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
          false,
          requestedCreationScope,
        );
      }
    }

    const pendingOAuth = new OAuthLifecycleRelay({
      oauthStart: opts.oauthStart,
      oauthEnd: opts.oauthEnd,
      logPrefix: `[MCP][User: ${userId}][${serverName}]`,
    });
    const creationGuard: ConnectionCreationGuard = { cancelled: false };
    this.registerConnectionCreation(lockKey, creationGuard);
    const createConnection = () =>
      this.createUserConnectionInternal(
        {
          ...opts,
          forceNew: forceNewConnection,
          ephemeralConnection,
          serverConfig: config,
          oauthStart: pendingOAuth.start,
          oauthEnd: pendingOAuth.end,
        },
        userId,
        clearCooldown,
        creationGuard,
        returnDetached,
      );
    const resolvedCreationScope =
      creationScope ??
      (proofBound
        ? {
            scope: oauthAuthorityScope!,
            authorizationKind: authorityAuthorizationKind!,
          }
        : null);
    const creationQueueKey = this.getConnectionCreationQueueKey(
      lockKey,
      resolvedCreationScope?.scope,
      resolvedCreationScope?.authorizationKind,
    );
    const connectionPromise = !ephemeralConnection
      ? this.runWithForceNewConnectionQueue(creationQueueKey, createConnection)
      : createConnection();

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
      this.unregisterConnectionCreation(lockKey, creationGuard);
      if (
        !forceNewConnection &&
        this.pendingConnections.get(lockKey)?.promise === connectionPromise
      ) {
        this.pendingConnections.delete(lockKey);
      }
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
    creationGuard?: ConnectionCreationGuard,
    returnDetached = false,
  ): Promise<MCPConnection> {
    if (creationGuard?.cancelled) {
      throw new Error(
        `[MCP][User: ${userId}][${serverName}] Connection creation was cancelled during teardown`,
      );
    }
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

    /** Capture before resolving credentials/creating the connection. If another replica rotates
     *  the generation while creation is in flight, this connection's publications are fenced. */
    const publicationGeneration = ephemeralConnection
      ? undefined
      : await getMCPToolsChangedGeneration({ userId, serverName });

    const userServerMap = this.userConnections.get(userId);
    let connection = userServerMap?.get(serverName);
    if (forceNew && connection && !ephemeralConnection && !returnDetached) {
      logger.info(
        `[MCP][User: ${userId}][${serverName}] Disposing existing connection before forced replacement`,
      );
      await this.disconnectUserConnection(userId, serverName, undefined, creationGuard);
      connection = undefined;
    } else if (forceNew) {
      connection = undefined;
    }
    if (clearCooldown) {
      MCPConnection.clearCooldown(serverName);
    }
    const now = Date.now();

    const existingPublicationGeneration = connection
      ? this.toolPublicationGenerations.get(connection)
      : undefined;
    const configGeneration = config
      ? getMCPAppToolsPublicationGeneration(config, proofBound ? effectiveServerConfig : undefined)
      : undefined;
    const existingConfigGeneration = connection
      ? this.toolConfigGenerations.get(connection)
      : undefined;
    if (
      connection &&
      configGeneration &&
      existingConfigGeneration &&
      configGeneration !== existingConfigGeneration
    ) {
      logger.info(
        `[MCP][User: ${userId}][${serverName}] Config identity changed, disconnecting stale connection`,
      );
      await this.disconnectUserConnection(userId, serverName, undefined, creationGuard);
      connection = undefined;
    }
    if (
      connection &&
      publicationGeneration &&
      existingPublicationGeneration &&
      publicationGeneration !== existingPublicationGeneration
    ) {
      logger.info(
        `[MCP][User: ${userId}][${serverName}] Cache generation changed, disconnecting stale connection`,
      );
      await this.disconnectUserConnection(userId, serverName, undefined, creationGuard);
      connection = undefined;
    }

    // Check if user is idle
    const lastActivity = this.userLastActivity.get(userId);
    if (lastActivity && now - lastActivity > mcpConfig.USER_CONNECTION_IDLE_TIMEOUT) {
      logger.info(`[MCP][User: ${userId}] User idle for too long. Disconnecting all connections.`);
      // Disconnect all user connections
      try {
        await this.disconnectUserConnections(userId, creationGuard);
      } catch (err) {
        logger.error(`[MCP][User: ${userId}] Error disconnecting idle connections:`, err);
      }
      connection = undefined; // Force creation of a new connection
    } else if (connection) {
      if (!config || (config.updatedAt && connection.isStale(config.updatedAt))) {
        if (config) {
          logger.info(
            `[MCP][User: ${userId}][${serverName}] Config was updated, evicting stale connection`,
          );
        }
        await this.disconnectUserConnection(userId, serverName, connection, creationGuard);
        connection = undefined;
      } else {
        const activeRecovery = this.getActiveConnectionRecovery(connection);
        let awaitedRecovery = activeRecovery;
        if (activeRecovery) {
          await this.waitForConnectionRecovery(activeRecovery, signal);
        }
        let connected = await connection.isConnected();
        let recovery = this.getActiveConnectionRecovery(connection);
        while (recovery && recovery !== awaitedRecovery) {
          awaitedRecovery = recovery;
          await this.waitForConnectionRecovery(recovery, signal);
          connected = await connection.isConnected();
          recovery = this.getActiveConnectionRecovery(connection);
        }
        if (connected) {
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
            await this.updateUserLastActivity(userId);
            await this.assertToolPublicationLeaseCurrent(
              connection,
              userId,
              serverName,
              creationGuard,
            );
            if (creationGuard?.cancelled) {
              throw new Error(
                `[MCP][User: ${userId}][${serverName}] Connection creation was cancelled during teardown`,
              );
            }
            return connection;
          }
          logger.info(
            `[MCP][User: ${userId}][${serverName}] Connection scope changed, disconnecting stale connection`,
          );
        } else {
          logger.warn(
            `[MCP][User: ${userId}][${serverName}] Found existing but disconnected connection object. Cleaning up.`,
          );
        }
        await this.disconnectUserConnection(userId, serverName, undefined, creationGuard);
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

      if (creationGuard?.cancelled) {
        throw new Error(
          `[MCP][User: ${userId}][${serverName}] Connection creation was cancelled during teardown`,
        );
      }

      if (publicationGeneration) {
        this.toolPublicationGenerations.set(connection, publicationGeneration);
      }
      if (configGeneration) {
        this.toolConfigGenerations.set(connection, configGeneration);
      }

      connection.on?.('toolsChanged', (tools: t.MCPTool[], publicationRevision?: string) => {
        void notifyMCPToolsChanged({
          tools,
          userId,
          serverName,
          serverConfig: config,
          ...(publicationGeneration && { publicationGeneration }),
          ...(publicationRevision && { publicationRevision }),
        });
      });

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
        await this.updateUserLastActivity(userId);
        await this.assertToolPublicationLeaseCurrent(connection, userId, serverName, creationGuard);
      }
      if (creationGuard?.cancelled) {
        throw new Error(
          `[MCP][User: ${userId}][${serverName}] Connection creation was cancelled during teardown`,
        );
      }
      return connection;
    } catch (error) {
      logger.error(`[MCP][User: ${userId}][${serverName}] Failed to establish connection`, error);
      // Ensure partial connection state is cleaned up if initialization fails
      if (connection) {
        await this.disposeConnection(connection).catch((disconnectError) => {
          logger.error(
            `[MCP][User: ${userId}][${serverName}] Error during cleanup after failed connection`,
            disconnectError,
          );
        });
      }
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
    const provenance = connection.getDiscoveryProvenance?.() ?? null;
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
    /** Plugin-authored placeholders must never resolve against the user's Graph token. */
    const graphProcessedConfig =
      dbSourced || isPluginSourced(config)
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
    const teardown = this.disposeConnection(connection);
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
      await this.disposeEvictedConnection(
        displacedConnection,
        `[MCP][User: ${userId}][${serverName}]`,
      );
    } catch (error) {
      logger.warn(
        `[MCP][User: ${userId}][${serverName}] Failed to disconnect displaced scoped connection`,
        error,
      );
    }
  }

  protected retainConnection(connection: MCPConnection): void {
    const borrowers = this.connectionBorrowers.get(connection) ?? 0;
    this.connectionBorrowers.set(connection, borrowers + 1);
  }

  protected getActiveConnectionRecovery(_connection: MCPConnection): Promise<void> | undefined {
    return undefined;
  }

  protected waitForConnectionRecovery(
    recovery: Promise<void>,
    _signal?: AbortSignal,
  ): Promise<void> {
    return recovery;
  }

  protected holdDeferredConnectionDisposal(connection: MCPConnection): void {
    const holds = this.deferredConnectionDisposalHolds.get(connection) ?? 0;
    this.deferredConnectionDisposalHolds.set(connection, holds + 1);
  }

  protected async releaseDeferredConnectionDisposal(connection: MCPConnection): Promise<void> {
    const holds = this.deferredConnectionDisposalHolds.get(connection) ?? 0;
    if (holds > 1) {
      this.deferredConnectionDisposalHolds.set(connection, holds - 1);
      return;
    }
    this.deferredConnectionDisposalHolds.delete(connection);
    await this.finalizeDeferredConnectionDisposal(connection);
  }

  protected async releaseConnection(connection: MCPConnection): Promise<void> {
    const borrowers = this.connectionBorrowers.get(connection) ?? 0;
    if (borrowers > 1) {
      this.connectionBorrowers.set(connection, borrowers - 1);
      return;
    }

    this.connectionBorrowers.delete(connection);
    await this.finalizeDeferredConnectionDisposal(connection);

    const drainWaiters = this.connectionBorrowerDrainWaiters.get(connection);
    if (drainWaiters) {
      this.connectionBorrowerDrainWaiters.delete(connection);
      for (const resolve of drainWaiters) {
        resolve();
      }
    }
  }

  protected waitForConnectionBorrowersToDrain(connection: MCPConnection): Promise<void> {
    if ((this.connectionBorrowers.get(connection) ?? 0) === 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const drainWaiters = this.connectionBorrowerDrainWaiters.get(connection) ?? new Set();
      drainWaiters.add(resolve);
      this.connectionBorrowerDrainWaiters.set(connection, drainWaiters);
    });
  }

  protected bindRequestScopedConnectionStore(
    requestScopedConnections?: t.RequestScopedMCPConnectionStore,
  ): void {
    if (!requestScopedConnections || requestScopedConnections.disposeConnection) {
      return;
    }

    requestScopedConnections.disposeConnection = async (connectionKey, connection) => {
      await this.disposeEvictedConnection(
        connection as MCPConnection,
        `[MCP][Request-scoped: ${connectionKey}]`,
      );
    };
  }

  protected async disposeEvictedConnection(
    connection: MCPConnection,
    logPrefix: string,
  ): Promise<void> {
    this.deferredConnectionDisposals.set(connection, logPrefix);
    await this.finalizeDeferredConnectionDisposal(connection);
  }

  private async finalizeDeferredConnectionDisposal(connection: MCPConnection): Promise<void> {
    if (
      (this.connectionBorrowers.get(connection) ?? 0) > 0 ||
      (this.deferredConnectionDisposalHolds.get(connection) ?? 0) > 0
    ) {
      return;
    }

    const logPrefix = this.deferredConnectionDisposals.get(connection);
    if (!logPrefix) {
      return;
    }
    this.deferredConnectionDisposals.delete(connection);
    await this.disposeEvictedConnectionNow(connection, logPrefix);
  }

  private async disposeEvictedConnectionNow(
    connection: MCPConnection,
    logPrefix: string,
  ): Promise<void> {
    try {
      const teardown = connection.dispose?.() ?? connection.disconnect();
      await teardown;
    } catch (error) {
      logger.warn(`${logPrefix} Failed to dispose evicted connection`, error);
    }
  }

  /** Disconnects and removes a specific user connection. */
  public async disconnectUserConnection(
    userId: string,
    serverName: string,
    expectedConnection?: MCPConnection,
    preservedCreation?: ConnectionCreationGuard,
  ): Promise<void> {
    const lockKey = `${userId}:${serverName}`;
    this.cancelConnectionCreations(lockKey, preservedCreation);
    const userMap = this.userConnections.get(userId);
    const connection = userMap?.get(serverName);
    if (expectedConnection && connection !== expectedConnection) {
      await this.closeDetachedUserConnection(userId, serverName, expectedConnection);
      return;
    }
    if (!expectedConnection && preservedCreation == null) {
      this.pendingConnections.delete(lockKey);
    }
    try {
      if (connection) {
        const logPrefix = `[MCP][User: ${userId}][${serverName}]`;
        logger.info(`${logPrefix} Disconnecting...`);
        connection.removeAllListeners?.('toolsChanged');
        this.removeUserConnectionIfOwned(userId, serverName, connection);
        await this.disposeEvictedConnection(connection, logPrefix);
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
    } finally {
      await cancelMCPToolsChanged({ userId, serverName });
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
  public async disconnectUserConnections(
    userId: string,
    preservedCreation?: ConnectionCreationGuard,
  ): Promise<void> {
    for (const key of this.activeConnectionCreations.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.cancelConnectionCreations(key, preservedCreation);
      }
    }
    if (preservedCreation == null) {
      for (const key of this.pendingConnections.keys()) {
        if (key.startsWith(`${userId}:`)) {
          this.pendingConnections.delete(key);
        }
      }
    }
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
          this.disconnectUserConnection(userId, serverName, undefined, preservedCreation).catch(
            (error) => {
              logger.error(
                `[MCP][User: ${userId}][${serverName}] Error during disconnection:`,
                error,
              );
            },
          ),
        );
      }
      await Promise.allSettled(disconnectPromises);
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
