const { logger } = require('@librechat/data-schemas');
const { findToken, createToken, updateToken } = require('~/models');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { CacheKeys } = require('librechat-data-provider');
const { getLogStores } = require('~/cache');

const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000; // ms

/**
 * Attempts to reconnect OAuth MCP servers for a user on login/refresh
 * This is a best-effort operation that runs asynchronously
 *
 * @param {string} userId - The user ID
 * @returns {Promise<void>}
 */
async function reconnectOAuthMCPServers(userId) {
  if (userId == null) {
    return;
  }

  const mcpManager = getMCPManager();
  if (mcpManager == null) {
    return;
  }

  // 1. derive the servers to reconnect
  const serversToReconnect = [];
  for (const serverName of mcpManager.getOAuthServers()) {
    const shouldReconnect = await shouldAttemptReconnect(mcpManager, userId, serverName);
    if (shouldReconnect) {
      serversToReconnect.push(serverName);
    }
  }

  // 2. mark the servers as reconnecting
  for (const serverName of serversToReconnect) {
    mcpManager.markAsReconnecting(userId, serverName);
  }

  // 3. attempt to reconnect the servers
  for (const serverName of serversToReconnect) {
    void tryReconnectOAuthMCPServer(mcpManager, userId, serverName);
  }
}

async function shouldAttemptReconnect(mcpManager, userId, serverName) {
  // if the server is already reconnecting, don't attempt to reconnect
  if (!mcpManager.shouldAttemptReconnect(userId, serverName)) {
    return false;
  }

  // if the server is already connected, don't attempt to reconnect
  const existingConnections = mcpManager.getUserConnections(userId);
  if (existingConnections?.has(serverName)) {
    const isConnected = await existingConnections.get(serverName)?.isConnected();
    if (isConnected) {
      return false;
    }
  }

  // if the server has no tokens for the user, don't attempt to reconnect
  const accessToken = await findToken({
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

async function tryReconnectOAuthMCPServer(mcpManager, userId, serverName) {
  const logPrefix = `[tryReconnectOAuthMCPServer][User: ${userId}][${serverName}]`;

  logger.info(`${logPrefix} Attempting reconnection`);

  const config = mcpManager.getRawConfig(serverName);
  const flowManager = getFlowStateManager(getLogStores(CacheKeys.FLOWS));

  function cleanupOnFailedReconnect() {
    mcpManager.recordFailedReconnect(userId, serverName);
    mcpManager.clearReconnectingState(userId, serverName);
    mcpManager.removeUserConnection(userId, serverName);
  }

  try {
    // attempt to get connection (this will use existing tokens and refresh if needed)
    const connection = await mcpManager.getUserConnection({
      serverName,
      user: { id: userId },
      flowManager,
      tokenMethods: { findToken, createToken, updateToken },
      // don't force new connection, let it reuse existing or create new as needed
      forceNew: false,
      // set a reasonable timeout for reconnection attempts
      connectionTimeout: config?.initTimeout ?? DEFAULT_CONNECTION_TIMEOUT_MS,
      // don't trigger OAuth flow during reconnection
      returnOnOAuth: true,
    });

    if (connection && (await connection.isConnected())) {
      logger.info(`${logPrefix} Successfully reconnected`);
      mcpManager.clearFailedReconnect(userId, serverName);
      mcpManager.clearReconnectingState(userId, serverName);
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

module.exports = {
  reconnectOAuthMCPServers,
};
