import { logger, getTenantId } from '@librechat/data-schemas';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { MCPOAuthFlowMetadata } from '~/mcp/oauth';
import type { FlowState } from '~/flow/types';
import type * as t from './types';
import {
  cancelMCPToolsChanged,
  getMCPAppToolsPublicationGeneration,
  getMCPToolsChangedGeneration,
  notifyMCPToolsChanged,
  renewMCPToolsChangedGeneration,
} from '~/mcp/toolsChanged';
import {
  getMissingRuntimeBodyPlaceholderFields,
  hasRuntimeUrlPlaceholders,
  isUserSourced,
  requiresEphemeralUserConnection,
  requiresOAuthMachinery,
} from './utils';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';
import { detectOAuthRequirement, MCPOAuthHandler } from '~/mcp/oauth';
import { ConnectionsRepository } from '~/mcp/ConnectionsRepository';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { processMCPEnv, isPluginSourced } from '~/utils/env';
import { preProcessGraphTokens } from '~/utils/graph';
import { isMCPDomainAllowed } from '~/auth/domain';
import { PENDING_STALE_MS } from '~/flow/manager';
import { MCPConnection } from './connection';
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

type PendingConnection = {
  promise: Promise<MCPConnection>;
  oauth: PendingOAuthState;
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
  /** Last activity timestamp for users (not per server) */
  protected userLastActivity: Map<string, number> = new Map();
  /** In-flight connection promises keyed by `userId:serverName` — coalesces concurrent attempts */
  protected pendingConnections: Map<string, PendingConnection> = new Map();
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
    await this.disconnectUserConnection(userId, serverName, creationGuard);
    throw new Error(`[MCP][User: ${userId}][${serverName}] Publication lease is no longer current`);
  }

  /** Gets or creates a connection for a specific user, coalescing concurrent attempts */
  public async getUserConnection(opts: t.UserMCPConnectionOptions): Promise<MCPConnection> {
    const { serverName, forceNew, user } = opts;
    const userId = user?.id;
    if (!userId) {
      throw new McpError(ErrorCode.InvalidRequest, `[MCP] User object missing id property`);
    }

    const config =
      opts.serverConfig ??
      (await MCPServersRegistry.getInstance().getServerConfig(serverName, userId));
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
          logger.debug(`[MCP][User: ${userId}][${serverName}] Reusing request-scoped connection`);
          return existing;
        } else {
          requestScopedConnections.connections.delete(requestConnectionKey);
        }
      }

      const pending = requestScopedConnections.pending.get(requestConnectionKey) as
        | Promise<MCPConnection>
        | undefined;
      if (pending) {
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
        logger.debug(`[MCP][User: ${userId}][${serverName}] Joining in-flight connection attempt`);
        await this.addPendingOAuthStart(pending.oauth, opts, userId);
        return pending.promise;
      }
    }

    const pendingOAuth = this.createPendingOAuthState(opts.oauthStart);
    const creationGuard: ConnectionCreationGuard = { cancelled: false };
    this.registerConnectionCreation(lockKey, creationGuard);
    const createConnection = () =>
      this.createUserConnectionInternal(
        {
          ...opts,
          forceNew: forceNewConnection,
          ephemeralConnection,
          serverConfig: config,
          oauthStart: this.createPendingOAuthStart(serverName, userId, pendingOAuth),
        },
        userId,
        clearCooldown,
        creationGuard,
      );
    const connectionPromise = !ephemeralConnection
      ? this.runWithForceNewConnectionQueue(lockKey, createConnection)
      : createConnection();

    if (!forceNewConnection) {
      this.pendingConnections.set(lockKey, {
        promise: connectionPromise,
        oauth: pendingOAuth,
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
    }: t.UserMCPConnectionOptions,
    userId: string,
    clearCooldown: boolean,
    creationGuard?: ConnectionCreationGuard,
  ): Promise<MCPConnection> {
    if (creationGuard?.cancelled) {
      throw new Error(
        `[MCP][User: ${userId}][${serverName}] Connection creation was cancelled during teardown`,
      );
    }
    if (await this.appConnections!.has(serverName)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `[MCP][User: ${userId}] Trying to create user-specific connection for app-level server "${serverName}"`,
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
    if (forceNew && connection && !ephemeralConnection) {
      logger.info(
        `[MCP][User: ${userId}][${serverName}] Disposing existing connection before forced replacement`,
      );
      await this.disconnectUserConnection(userId, serverName, creationGuard);
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
    const configGeneration = config ? getMCPAppToolsPublicationGeneration(config) : undefined;
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
      await this.disconnectUserConnection(userId, serverName, creationGuard);
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
      await this.disconnectUserConnection(userId, serverName, creationGuard);
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
            `[MCP][User: ${userId}][${serverName}] Config was updated, disconnecting stale connection`,
          );
        }
        await this.disconnectUserConnection(userId, serverName, creationGuard);
        connection = undefined;
      } else if (await connection.isConnected()) {
        logger.debug(`[MCP][User: ${userId}][${serverName}] Reusing active connection`);
        await this.updateUserLastActivity(userId);
        await this.assertToolPublicationLeaseCurrent(connection, userId, serverName, creationGuard);
        if (creationGuard?.cancelled) {
          throw new Error(
            `[MCP][User: ${userId}][${serverName}] Connection creation was cancelled during teardown`,
          );
        }
        return connection;
      } else {
        logger.warn(
          `[MCP][User: ${userId}][${serverName}] Found existing but disconnected connection object. Cleaning up.`,
        );
        await this.disconnectUserConnection(userId, serverName, creationGuard);
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

    try {
      const runtimeConfig = await this.applyRuntimeOAuthDetection({
        config,
        user,
        customUserVars,
        requestBody,
        graphTokenResolver,
      });
      const registry = MCPServersRegistry.getInstance();
      const { allowedDomains, allowedAddresses, useSSRFProtection } =
        await registry.resolveAllowlists({ userId: user?.id, role: user?.role });
      await this.assertResolvedRuntimeConfigAllowed({
        config: runtimeConfig,
        user,
        customUserVars,
        requestBody,
        graphTokenResolver,
        allowedDomains,
        allowedAddresses,
        logPrefix: `[MCP][User: ${userId}][${serverName}]`,
      });
      const basic: t.BasicConnectionOptions = {
        serverConfig: runtimeConfig,
        serverName: serverName,
        dbSourced: isUserSourced(runtimeConfig),
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
        };
      } else {
        connectionOptions = {
          user,
          customUserVars,
          requestBody,
          graphTokenResolver,
          connectionTimeout,
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

      connection.on('toolsChanged', (tools: t.MCPTool[], publicationRevision?: string) => {
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
        await connection.refreshToolList();
        if (creationGuard?.cancelled) {
          throw new Error(
            `[MCP][User: ${userId}][${serverName}] Connection creation was cancelled during teardown`,
          );
        }
        if (!this.userConnections.has(userId)) {
          this.userConnections.set(userId, new Map());
        }
        this.userConnections.get(userId)?.set(serverName, connection);
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
      connection?.removeAllListeners?.('toolsChanged');
      await connection?.dispose().catch((disconnectError) => {
        logger.error(
          `[MCP][User: ${userId}][${serverName}] Error during cleanup after failed connection`,
          disconnectError,
        );
      });
      // Ensure cleanup even if connection attempt fails
      if (connection && this.userConnections.get(userId)?.get(serverName) === connection) {
        this.removeUserConnection(userId, serverName);
      }
      throw error; // Re-throw the error to the caller
    }
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
    if (
      config.requiresOAuth != null ||
      (config.apiKey != null && config.oauth == null) ||
      !hasRuntimeUrlPlaceholders(config)
    ) {
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
        // Only remove user activity timestamp if all connections are gone
        this.userLastActivity.delete(userId);
      }
    }

    logger.debug(`[MCP][User: ${userId}][${serverName}] Removed connection entry.`);
  }

  /** Disconnects and removes a specific user connection */
  public async disconnectUserConnection(
    userId: string,
    serverName: string,
    preservedCreation?: ConnectionCreationGuard,
  ): Promise<void> {
    const pendingKey = `${userId}:${serverName}`;
    const pending = this.pendingConnections.get(pendingKey);
    this.cancelConnectionCreations(pendingKey, preservedCreation);
    if (pending && preservedCreation == null) {
      this.pendingConnections.delete(pendingKey);
    }
    const userMap = this.userConnections.get(userId);
    const connection = userMap?.get(serverName);
    try {
      if (connection) {
        logger.info(`[MCP][User: ${userId}][${serverName}] Disconnecting...`);
        connection.removeAllListeners?.('toolsChanged');
        this.removeUserConnection(userId, serverName);
        await connection.dispose();
      }
    } finally {
      await cancelMCPToolsChanged({ userId, serverName });
    }
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
    const disconnectPromises: Promise<void>[] = [];
    if (userMap) {
      logger.info(`[MCP][User: ${userId}] Disconnecting all servers...`);
      const userServers = Array.from(userMap.keys());
      for (const serverName of userServers) {
        disconnectPromises.push(
          this.disconnectUserConnection(userId, serverName, preservedCreation).catch((error) => {
            logger.error(
              `[MCP][User: ${userId}][${serverName}] Error during disconnection:`,
              error,
            );
          }),
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
    return {
      trackedUsers: this.userConnections.size,
      totalConnections,
      activityEntries: this.userLastActivity.size,
      appConnectionCount: this.appConnections?.getConnectionCount() ?? 0,
    };
  }
}
