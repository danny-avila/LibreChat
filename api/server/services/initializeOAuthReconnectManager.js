const { logger } = require('@librechat/data-schemas');
const { publishMCPAuthorizationMutation } = require('@librechat/api');
const { CacheKeys } = require('librechat-data-provider');
const { createOAuthReconnectionManager, getFlowStateManager, getMCPManager } = require('~/config');
const { findToken, updateToken, createToken, deleteTokens } = require('~/models');
const { getLogStores } = require('~/cache');
const { invalidateCachedTools } = require('~/server/services/Config');

/**
 * Initialize OAuth reconnect manager
 */
async function initializeOAuthReconnectManager() {
  try {
    const flowManager = getFlowStateManager(getLogStores(CacheKeys.FLOWS));
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
      }),
    );
    logger.info(`OAuth reconnect manager initialized successfully.`);
  } catch (error) {
    logger.error('Failed to initialize OAuth reconnect manager:', error);
  }
}

module.exports = initializeOAuthReconnectManager;
