import { logger } from '@librechat/data-schemas';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type * as t from './types';
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
import { OAuthLifecycleRelay } from '~/mcp/oauth/pending';
import { preProcessGraphTokens } from '~/utils/graph';
import { detectOAuthRequirement } from '~/mcp/oauth';
import { isMCPDomainAllowed } from '~/auth/domain';
import { MCPConnection } from './connection';
import { processMCPEnv } from '~/utils/env';
import { mcpConfig } from './mcpConfig';

type PendingConnection = {
  promise: Promise<MCPConnection>;
  oauth: OAuthLifecycleRelay;
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
  /** Last activity timestamp for users (not per server) */
  protected userLastActivity: Map<string, number> = new Map();
  /** In-flight connection promises keyed by `userId:serverName` — coalesces concurrent attempts */
  protected pendingConnections: Map<string, PendingConnection> = new Map();
  private readonly connectionBorrowers = new WeakMap<MCPConnection, number>();
  private readonly connectionBorrowerDrainWaiters = new WeakMap<MCPConnection, Set<() => void>>();
  private readonly deferredConnectionDisposalHolds = new WeakMap<MCPConnection, number>();

  private readonly deferredConnectionDisposals = new WeakMap<MCPConnection, string>();

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
    const connectionPromise = this.createUserConnectionInternal(
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
    );

    if (!forceNewConnection) {
      this.pendingConnections.set(lockKey, { promise: connectionPromise, oauth: pendingOAuth });
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
  ): Promise<MCPConnection> {
    if (await this.appConnections!.has(serverName)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `[MCP][User: ${userId}] Trying to create user-specific connection for app-level server "${serverName}"`,
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
            `[MCP][User: ${userId}][${serverName}] Config was updated, evicting stale connection`,
          );
        }
        this.removeUserConnection(userId, serverName);
        await this.disposeEvictedConnection(connection, `[MCP][User: ${userId}][${serverName}]`);
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
          this.updateUserLastActivity(userId);
          return connection;
        }
        // Connection exists but is not connected, attempt to remove potentially stale entry
        logger.warn(
          `[MCP][User: ${userId}][${serverName}] Found existing but disconnected connection object. Cleaning up.`,
        );
        this.removeUserConnection(userId, serverName); // Clean up maps
        await this.disposeEvictedConnection(connection, `[MCP][User: ${userId}][${serverName}]`);
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

      if (!(await connection?.isConnected())) {
        throw new Error('Failed to establish connection after initialization attempt.');
      }

      if (!ephemeralConnection) {
        if (!this.userConnections.has(userId)) {
          this.userConnections.set(userId, new Map());
        }
        this.userConnections.get(userId)?.set(serverName, connection);
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
      // Ensure cleanup even if connection attempt fails
      this.removeUserConnection(userId, serverName);
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

  private async disposeEvictedConnection(
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
  public async disconnectUserConnection(userId: string, serverName: string): Promise<void> {
    this.pendingConnections.delete(`${userId}:${serverName}`);
    const userMap = this.userConnections.get(userId);
    const connection = userMap?.get(serverName);
    if (connection) {
      const logPrefix = `[MCP][User: ${userId}][${serverName}]`;
      logger.info(`${logPrefix} Disconnecting...`);
      this.removeUserConnection(userId, serverName);
      await this.disposeEvictedConnection(connection, logPrefix);
    }
  }

  /** Disconnects and removes all connections for a specific user */
  public async disconnectUserConnections(userId: string): Promise<void> {
    const userMap = this.userConnections.get(userId);
    const disconnectPromises: Promise<void>[] = [];
    if (userMap) {
      logger.info(`[MCP][User: ${userId}] Disconnecting all servers...`);
      const userServers = Array.from(userMap.keys());
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
    return {
      trackedUsers: this.userConnections.size,
      totalConnections,
      activityEntries: this.userLastActivity.size,
      appConnectionCount: this.appConnections?.getConnectionCount() ?? 0,
    };
  }
}
