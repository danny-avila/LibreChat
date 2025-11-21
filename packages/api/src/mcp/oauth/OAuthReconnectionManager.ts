import { logger } from '@librechat/data-schemas';
import type { TokenMethods, IUser } from '@librechat/data-schemas';
import type { MCPOAuthTokens } from './types';
import { OAuthReconnectionTracker } from './OAuthReconnectionTracker';
import { FlowStateManager } from '~/flow/manager';
import { MCPManager } from '~/mcp/MCPManager';
import { mcpServersRegistry } from '~/mcp/registry/MCPServersRegistry';

const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000; // ms

export class OAuthReconnectionManager {
  private static instance: OAuthReconnectionManager | null = null;

  protected readonly flowManager: FlowStateManager<MCPOAuthTokens | null>;
  protected readonly tokenMethods: TokenMethods;
  private readonly mcpManager: MCPManager | null;

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
  ): Promise<OAuthReconnectionManager> {
    if (OAuthReconnectionManager.instance != null) {
      throw new Error('OAuthReconnectionManager already initialized');
    }

    const manager = new OAuthReconnectionManager(flowManager, tokenMethods, reconnections);
    OAuthReconnectionManager.instance = manager;

    return manager;
  }

  public constructor(
    flowManager: FlowStateManager<MCPOAuthTokens | null>,
    tokenMethods: TokenMethods,
    reconnections?: OAuthReconnectionTracker,
  ) {
    this.flowManager = flowManager;
    this.tokenMethods = tokenMethods;
    this.reconnectionsTracker = reconnections ?? new OAuthReconnectionTracker();

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

  public async reconnectServers(userId: string) {
    // Check if MCPManager is available
    if (this.mcpManager == null) {
      logger.warn(
        '[OAuthReconnectionManager] MCPManager not available, skipping OAuth MCP server reconnection',
      );
      return;
    }

    // 1. derive the servers to reconnect
    const serversToReconnect = [];
    for (const serverName of await mcpServersRegistry.getOAuthServers()) {
      const canReconnect = await this.canReconnect(userId, serverName);
      if (canReconnect) {
        serversToReconnect.push(serverName);
      }
    }

    // 2. mark the servers as reconnecting
    for (const serverName of serversToReconnect) {
      this.reconnectionsTracker.setActive(userId, serverName);
    }

    // 3. attempt to reconnect the servers
    for (const serverName of serversToReconnect) {
      void this.tryReconnect(userId, serverName);
    }
  }

  public clearReconnection(userId: string, serverName: string) {
    this.reconnectionsTracker.removeFailed(userId, serverName);
    this.reconnectionsTracker.removeActive(userId, serverName);
  }

  private async tryReconnect(userId: string, serverName: string) {
    if (this.mcpManager == null) {
      return;
    }

    const logPrefix = `[tryReconnectOAuthMCPServer][User: ${userId}][${serverName}]`;

    logger.info(`${logPrefix} Attempting reconnection`);

    const config = await mcpServersRegistry.getServerConfig(serverName, userId);

    const cleanupOnFailedReconnect = () => {
      this.reconnectionsTracker.setFailed(userId, serverName);
      this.reconnectionsTracker.removeActive(userId, serverName);
      this.mcpManager?.disconnectUserConnection(userId, serverName);
    };

    try {
      // attempt to get connection (this will use existing tokens and refresh if needed)
      const connection = await this.mcpManager.getUserConnection({
        serverName,
        user: { id: userId } as IUser,
        flowManager: this.flowManager,
        tokenMethods: this.tokenMethods,
        // don't force new connection, let it reuse existing or create new as needed
        forceNew: false,
        // set a reasonable timeout for reconnection attempts
        connectionTimeout: config?.initTimeout ?? DEFAULT_CONNECTION_TIMEOUT_MS,
        // don't trigger OAuth flow during reconnection
        returnOnOAuth: true,
      });

      if (connection && (await connection.isConnected())) {
        logger.info(`${logPrefix} Successfully reconnected`);
        this.clearReconnection(userId, serverName);
      } else {
        logger.warn(`${logPrefix} Failed to reconnect`);
        await connection?.disconnect();
        cleanupOnFailedReconnect();
      }
    } catch (error) {
      logger.warn(`${logPrefix} Failed to reconnect: ${error}`);
      cleanupOnFailedReconnect();
    }
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

    // if the server has no tokens for the user, don't attempt to reconnect
    const accessToken = await this.tokenMethods.findToken({
      userId,
      type: 'mcp_oauth',
      identifier: `mcp:${serverName}`,
    });
    if (accessToken == null) {
      return false;
    }

    // if the token has expired, don't attempt to reconnect
    const now = new Date();
    if (accessToken.expiresAt && accessToken.expiresAt < now) {
      return false;
    }

    // …otherwise, we're good to go with the reconnect attempt
    return true;
  }
}
