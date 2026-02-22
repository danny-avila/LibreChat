const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { createOAuthReconnectionManager, getFlowStateManager } = require('~/config');
const { findToken, updateToken, createToken, deleteTokens } = require('~/models');
const { getLogStores } = require('~/cache');

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
    await createOAuthReconnectionManager(flowManager, tokenMethods);
    logger.info(`OAuth reconnect manager initialized successfully.`);
  } catch (error) {
    logger.error('Failed to initialize OAuth reconnect manager:', error);
  }
}

module.exports = initializeOAuthReconnectManager;
