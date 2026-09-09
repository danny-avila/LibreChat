const { logger } = require('@librechat/data-schemas');
const { publishMCPAuthorizationMutation } = require('@librechat/api');
const { CacheKeys } = require('librechat-data-provider');
const { createOAuthReconnectionManager, getFlowStateManager, getMCPManager } = require('~/config');
const { findToken, updateToken, createToken, deleteTokens } = require('~/models');
const { getLogStores } = require('~/cache');
const { getAppConfig, invalidateCachedTools } = require('~/server/services/Config');

/**
 * Initialize OAuth reconnect manager
 */
async function initializeOAuthReconnectManager() {
  try {
    const flowManager = getFlowStateManager(getLogStores(CacheKeys.FLOWS));
    const appConfig = await getAppConfig({ baseOnly: true });
    const tokenMethods = {
      findToken,
      updateToken,
      createToken,
      deleteTokens,
    };
    await createOAuthReconnectionManager(flowManager, tokenMethods, undefined, (scope) =>
      publishMCPAuthorizationMutation(scope, {
        invalidateRecoveryGeneration: invalidateCachedTools,
        clearLocalRecovery: (userId, serverName) =>
          getMCPManager()?.clearCatalogRecoveryState?.(userId, serverName),
        retryDelaysMs: appConfig?.mcpSettings?.catalogRecovery?.authorizationFenceRetryMs,
        attemptTimeoutMs: appConfig?.mcpSettings?.catalogRecovery?.authorizationFenceTimeoutMs,
      }),
    );
    logger.info(`OAuth reconnect manager initialized successfully.`);
  } catch (error) {
    logger.error('Failed to initialize OAuth reconnect manager:', error);
  }
}

module.exports = initializeOAuthReconnectManager;
