import { logger } from '@librechat/data-schemas';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
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
import { ConnectionsRepository } from '~/mcp/ConnectionsRepository';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { processMCPEnv, isPluginSourced } from '~/utils/env';
import { OAuthLifecycleRelay } from '~/mcp/oauth/pending';
import { preProcessGraphTokens } from '~/utils/graph';
import { detectOAuthRequirement } from '~/mcp/oauth';
import { isMCPDomainAllowed } from '~/auth/domain';
import { MCPConnection } from './connection';
import { mcpConfig } from './mcpConfig';

type PendingConnection = {
  promise: Promise<MCPConnection>;
  oauth: OAuthLifecycleRelay;
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
            logger.debug(`[MCP][User: ${userId}][${serverName}] Reusing request-scoped connection`);
            return existing;
          }
          requestScopedConnections.connections.delete(requestConnectionKey);
          await this.disposeEvictedConnection(existing, `[MCP][User: ${userId}][${serverName}]`);
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
        await pending.oauth.add({
          oauthStart: opts.oauthStart,
          oauthEnd: opts.oauthEnd,
          flowManager: opts.flowManager,
          userId,
          serverName,
        });
        return pending.promise;
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
            `[MCP][User: ${userId}][${serverName}] Config was updated, evicting stale connection`,
          );
        }
        await this.disconnectUserConnection(userId, serverName, creationGuard);
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
    await this.disposeConnection(connection, logPrefix);
  }

  private async disposeConnection(connection: MCPConnection, logPrefix: string): Promise<void> {
    try {
      await connection.dispose();
    } catch (error) {
      logger.warn(`${logPrefix} Failed to dispose evicted connection`, error);
    }
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
        const logPrefix = `[MCP][User: ${userId}][${serverName}]`;
        logger.info(`${logPrefix} Disconnecting...`);
        connection.removeAllListeners?.('toolsChanged');
        this.removeUserConnection(userId, serverName);
        await this.disposeEvictedConnection(connection, logPrefix);
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
