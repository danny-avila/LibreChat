import { logger } from '@librechat/data-schemas';
import type { TokenMethods, IUser } from '@librechat/data-schemas';
import type {
  MCPConnectionProvenance,
  MCPToolCatalogScope,
  ParsedServerConfig,
} from '~/mcp/provenance';
import type { UserConnectionContext } from '~/mcp/types';
import type { MCPConnection } from '~/mcp/connection';
import type { MCPOAuthTokens } from './types';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';
import { OAuthReconnectionTracker } from './OAuthReconnectionTracker';
import { FlowStateManager } from '~/flow/manager';
import { MCPManager } from '~/mcp/MCPManager';

const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000; // ms
const RECONNECT_STAGGER_MS = 500; // ms between each server reconnection

export interface OAuthReconnectAuthority {
  user: IUser;
  serverConfig: ParsedServerConfig;
  effectiveServerConfig: ParsedServerConfig;
  securityPolicy: NonNullable<UserConnectionContext['securityPolicy']>;
  customUserVars?: Record<string, string>;
  oauthAuthorityScope: MCPToolCatalogScope;
  authorityAuthorizationKind: MCPConnectionProvenance['authorizationKind'];
  refreshAuthorityLifecycle: NonNullable<UserConnectionContext['refreshAuthorityLifecycle']>;
  bind<Result>(action: () => Promise<Result>): Promise<Result>;
}

export interface OAuthReconnectActor {
  userId: string;
  tenantId?: string;
  user: IUser;
}

export type OAuthReconnectActorInput = string | OAuthReconnectActor;

function normalizeReconnectActor(input: OAuthReconnectActorInput): OAuthReconnectActor {
  if (typeof input !== 'string') {
    return input;
  }
  return { userId: input, user: { id: input } as IUser };
}

export type ResolveOAuthReconnectAuthority = (
  actor: OAuthReconnectActor,
  serverName: string,
) => Promise<OAuthReconnectAuthority | null>;

export class OAuthReconnectionManager {
  private static instance: OAuthReconnectionManager | null = null;

  protected readonly flowManager: FlowStateManager<MCPOAuthTokens | null>;
  protected readonly tokenMethods: TokenMethods;
  private readonly mcpManager: MCPManager | null;
  private readonly resolveAuthority?: ResolveOAuthReconnectAuthority;

  private readonly reconnectionsTracker: OAuthReconnectionTracker;

  public static getInstance(): OAuthReconnectionManager {
    if (!OAuthReconnectionManager.instance) {
      throw new Error('OAuthReconnectionManager not initialized');
    }
    return OAuthReconnectionManager.instance;
  }

  public static async createInstance(
    flowManager: FlowStateManager<MCPOAuthTokens | null>,
    tokenMethods: TokenMethods,
    reconnections?: OAuthReconnectionTracker,
    resolveAuthority?: ResolveOAuthReconnectAuthority,
  ): Promise<OAuthReconnectionManager> {
    if (OAuthReconnectionManager.instance != null) {
      throw new Error('OAuthReconnectionManager already initialized');
    }

    const manager = new OAuthReconnectionManager(
      flowManager,
      tokenMethods,
      reconnections,
      resolveAuthority,
    );
    OAuthReconnectionManager.instance = manager;

    return manager;
  }

  public constructor(
    flowManager: FlowStateManager<MCPOAuthTokens | null>,
    tokenMethods: TokenMethods,
    reconnections?: OAuthReconnectionTracker,
    resolveAuthority?: ResolveOAuthReconnectAuthority,
  ) {
    this.flowManager = flowManager;
    this.tokenMethods = tokenMethods;
    this.reconnectionsTracker = reconnections ?? new OAuthReconnectionTracker();
    this.resolveAuthority = resolveAuthority;

    try {
      this.mcpManager = MCPManager.getInstance();
    } catch {
      this.mcpManager = null;
    }
  }

  public isReconnecting(userId: string, serverName: string): boolean {
    // Clean up if timed out, then return whether still reconnecting
    this.reconnectionsTracker.cleanupIfTimedOut(userId, serverName);
    return this.reconnectionsTracker.isStillReconnecting(userId, serverName);
  }

  public async reconnectServers(actorInput: OAuthReconnectActorInput): Promise<void> {
    const actor = normalizeReconnectActor(actorInput);
    const { userId } = actor;
    // Check if MCPManager is available
    if (this.mcpManager == null) {
      logger.warn(
        '[OAuthReconnectionManager] MCPManager not available, skipping OAuth MCP server reconnection',
      );
      return;
    }

    // 1. derive the servers to reconnect
    const serversToReconnect = [];
    for (const serverName of await MCPServersRegistry.getInstance().getOAuthServers()) {
      const canReconnect = await this.canReconnect(userId, serverName);
      if (canReconnect) {
        serversToReconnect.push(serverName);
      }
    }

    // 2. mark the servers as reconnecting
    for (const serverName of serversToReconnect) {
      this.reconnectionsTracker.setActive(userId, serverName);
    }

    // 3. attempt to reconnect the servers with staggered delays to avoid connection storms
    for (let i = 0; i < serversToReconnect.length; i++) {
      const serverName = serversToReconnect[i];
      if (i === 0) {
        this.safeTryReconnect(actor, serverName);
      } else {
        setTimeout(() => this.safeTryReconnect(actor, serverName), i * RECONNECT_STAGGER_MS);
      }
    }
  }

  /**
   * Fire-and-forget wrapper around {@link tryReconnect} that guarantees any
   * unexpected rejection is surfaced via the logger instead of propagating as
   * an unhandled promise rejection. Also runs the failed-reconnect cleanup so
   * the tracker does not get stuck in `active` state for the
   * `RECONNECTION_TIMEOUT_MS` window if an error escapes
   * {@link tryReconnect}'s internal try/catch.
   */
  private safeTryReconnect(actor: OAuthReconnectActor, serverName: string): void {
    this.tryReconnect(actor, serverName).catch((error) => {
      const { userId } = actor;
      logger.error(
        `[OAuthReconnectionManager][User: ${userId}][${serverName}] Unexpected reconnect error`,
        error,
      );
      this.cleanupOnFailedReconnect(userId, serverName);
    });
  }

  private cleanupOnFailedReconnect(userId: string, serverName: string): void {
    this.reconnectionsTracker.setFailed(userId, serverName);
    this.reconnectionsTracker.removeActive(userId, serverName);
  }

  /**
   * Attempts to reconnect a single OAuth MCP server.
   * @returns true if reconnection succeeded, false otherwise.
   */
  public async reconnectServer(
    actorInput: OAuthReconnectActorInput,
    serverName: string,
  ): Promise<boolean> {
    if (this.mcpManager == null) {
      return false;
    }

    const actor = normalizeReconnectActor(actorInput);
    const { userId } = actor;
    this.reconnectionsTracker.setActive(userId, serverName);
    try {
      await this.tryReconnect(actor, serverName);
      return !this.reconnectionsTracker.isFailed(userId, serverName);
    } catch {
      return false;
    }
  }

  public clearReconnection(userId: string, serverName: string): void {
    this.reconnectionsTracker.removeFailed(userId, serverName);
    this.reconnectionsTracker.removeActive(userId, serverName);
  }

  private async tryReconnect(actor: OAuthReconnectActor, serverName: string) {
    if (this.mcpManager == null) {
      return;
    }

    const { userId } = actor;
    const logPrefix = `[tryReconnectOAuthMCPServer][User: ${userId}][${serverName}]`;

    logger.info(`${logPrefix} Attempting reconnection`);

    let connection: MCPConnection | undefined;
    let connected = false;
    try {
      const authority = this.resolveAuthority
        ? await this.resolveAuthority(actor, serverName)
        : null;
      if (this.resolveAuthority && !authority) {
        throw new Error('Current MCP reconnect authority is unavailable');
      }
      const config =
        authority?.serverConfig ??
        (await MCPServersRegistry.getInstance().getServerConfig(serverName, userId));

      // attempt to get connection (this will use existing tokens and refresh if needed)
      const reconnect = async () =>
        await this.mcpManager!.getUserConnection({
          serverName,
          user: authority?.user ?? actor.user,
          flowManager: this.flowManager,
          tokenMethods: this.tokenMethods,
          serverConfig: authority?.serverConfig,
          effectiveServerConfig: authority?.effectiveServerConfig,
          securityPolicy: authority?.securityPolicy,
          customUserVars: authority?.customUserVars,
          oauthAuthorityScope: authority?.oauthAuthorityScope,
          authorityAuthorizationKind: authority?.authorityAuthorizationKind,
          refreshAuthorityLifecycle: authority?.refreshAuthorityLifecycle,
          // don't force new connection, let it reuse existing or create new as needed
          forceNew: false,
          // set a reasonable timeout for reconnection attempts
          connectionTimeout: config?.initTimeout ?? DEFAULT_CONNECTION_TIMEOUT_MS,
          // don't trigger OAuth flow during reconnection
          returnOnOAuth: true,
        });
      connection = authority ? await authority.bind(reconnect) : await reconnect();

      connected = connection != null && (await connection.isConnected());
      if (connected) {
        logger.info(`${logPrefix} Successfully reconnected`);
        this.clearReconnection(userId, serverName);
      } else {
        logger.warn(`${logPrefix} Failed to reconnect`);
      }
    } catch (error) {
      logger.warn(`${logPrefix} Failed to reconnect: ${error}`);
    } finally {
      if (!connected) {
        this.cleanupOnFailedReconnect(userId, serverName);
        if (connection) {
          try {
            await this.mcpManager.disconnectUserConnection(userId, serverName, connection);
          } catch (error) {
            logger.warn(`${logPrefix} Failed to disconnect rejected reconnection`, error);
          }
        }
      }
      if (connection && typeof this.mcpManager.releaseDetachedUserConnection === 'function') {
        try {
          await this.mcpManager.releaseDetachedUserConnection(userId, serverName, connection);
        } catch (error) {
          logger.warn(`${logPrefix} Failed to release detached reconnection`, error);
        }
      }
    }
  }

  public getTrackerStats(): {
    usersWithFailedServers: number;
    usersWithActiveReconnections: number;
    activeTimestamps: number;
  } {
    return this.reconnectionsTracker.getStats();
  }

  private async canReconnect(userId: string, serverName: string) {
    if (this.mcpManager == null) {
      return false;
    }

    // if the server has failed reconnection, don't attempt to reconnect
    if (this.reconnectionsTracker.isFailed(userId, serverName)) {
      return false;
    }

    if (this.reconnectionsTracker.isActive(userId, serverName)) {
      return false;
    }

    // if the server is already connected, don't attempt to reconnect
    const existingConnections = this.mcpManager.getUserConnections(userId);
    if (existingConnections?.has(serverName)) {
      const isConnected = await existingConnections.get(serverName)?.isConnected();
      if (isConnected) {
        return false;
      }
    }

    // if the server has a valid (non-expired) access token, allow reconnect
    const accessToken = await this.tokenMethods.findToken({
      userId,
      type: 'mcp_oauth',
      identifier: `mcp:${serverName}`,
    });

    if (accessToken != null) {
      const now = new Date();
      if (!accessToken.expiresAt || accessToken.expiresAt >= now) {
        return true;
      }
    }

    // if the access token is expired or TTL-deleted, fall back to refresh token
    const refreshToken = await this.tokenMethods.findToken({
      userId,
      type: 'mcp_oauth_refresh',
      identifier: `mcp:${serverName}:refresh`,
    });

    if (refreshToken == null) {
      return false;
    }

    return true;
  }
}
