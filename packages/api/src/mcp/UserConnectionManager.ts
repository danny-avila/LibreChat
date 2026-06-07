import { logger } from '@librechat/data-schemas';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { MCPOAuthFlowMetadata } from '~/mcp/oauth';
import type { FlowState } from '~/flow/types';
import type * as t from './types';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';
import { ConnectionsRepository } from '~/mcp/ConnectionsRepository';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { isUserSourced, requiresOAuthMachinery } from './utils';
import { PENDING_STALE_MS } from '~/flow/manager';
import { MCPOAuthHandler } from '~/mcp/oauth';
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

    const lockKey = `${userId}:${serverName}`;

    if (!forceNew) {
      const pending = this.pendingConnections.get(lockKey);
      if (pending) {
        logger.debug(`[MCP][User: ${userId}][${serverName}] Joining in-flight connection attempt`);
        await this.addPendingOAuthStart(pending.oauth, opts, userId);
        return pending.promise;
      }
    }

    const pendingOAuth = this.createPendingOAuthState(opts.oauthStart);
    const connectionPromise = this.createUserConnectionInternal(
      {
        ...opts,
        oauthStart: this.createPendingOAuthStart(serverName, userId, pendingOAuth),
      },
      userId,
    );

    if (!forceNew) {
      this.pendingConnections.set(lockKey, { promise: connectionPromise, oauth: pendingOAuth });
    }

    try {
      return await connectionPromise;
    } finally {
      if (!forceNew && this.pendingConnections.get(lockKey)?.promise === connectionPromise) {
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

    const flowId = MCPOAuthHandler.generateFlowId(userId, serverName);
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
      serverConfig: providedConfig,
    }: t.UserMCPConnectionOptions,
    userId: string,
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
    if (forceNew) {
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
        await this.disconnectUserConnection(userId, serverName);
        connection = undefined;
      } else if (await connection.isConnected()) {
        logger.debug(`[MCP][User: ${userId}][${serverName}] Reusing active connection`);
        this.updateUserLastActivity(userId);
        return connection;
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

    try {
      const registry = MCPServersRegistry.getInstance();
      const basic: t.BasicConnectionOptions = {
        serverConfig: config,
        serverName: serverName,
        dbSourced: isUserSourced(config),
        useSSRFProtection: registry.shouldEnableSSRFProtection(),
        allowedDomains: registry.getAllowedDomains(),
        allowedAddresses: registry.getAllowedAddresses(),
      };

      const useOAuth = requiresOAuthMachinery(config);
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
          returnOnOAuth: returnOnOAuth,
          requestBody: requestBody,
          connectionTimeout: connectionTimeout,
        };
      } else {
        connectionOptions = {
          user,
          customUserVars,
          requestBody,
          connectionTimeout,
        };
      }

      connection = await MCPConnectionFactory.create(basic, connectionOptions);

      if (!(await connection?.isConnected())) {
        throw new Error('Failed to establish connection after initialization attempt.');
      }

      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Map());
      }
      this.userConnections.get(userId)?.set(serverName, connection);

      logger.info(`[MCP][User: ${userId}][${serverName}] Connection successfully established`);
      // Update timestamp on creation
      this.updateUserLastActivity(userId);
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

  /** Returns all connections for a specific user */
  public getUserConnections(userId: string) {
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
  public async disconnectUserConnection(userId: string, serverName: string): Promise<void> {
    this.pendingConnections.delete(`${userId}:${serverName}`);
    const userMap = this.userConnections.get(userId);
    const connection = userMap?.get(serverName);
    if (connection) {
      logger.info(`[MCP][User: ${userId}][${serverName}] Disconnecting...`);
      await connection.disconnect();
      this.removeUserConnection(userId, serverName);
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
