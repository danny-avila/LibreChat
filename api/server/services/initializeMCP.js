const { logger } = require('@librechat/data-schemas');
const { CacheKeys, processMCPEnv } = require('librechat-data-provider');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { getLogStores } = require('~/cache');
const { findToken, updateToken, createToken, deleteTokens } = require('~/models');

/**
 * Initialize MCP servers
 * @param {import('express').Application} app - Express app instance
 */
async function initializeMCP(app) {
  const mcpConfig = app.locals.mcpConfig;
  if (!mcpConfig) {
    return;
  }

  logger.info('Initializing MCP servers...');
  const mcpManager = getMCPManager();
  const flowsCache = getLogStores(CacheKeys.FLOWS);
  const flowManager = flowsCache ? getFlowStateManager(flowsCache) : null;

  try {
    await mcpManager.initializeMCP(mcpConfig, processMCPEnv, flowManager, {
      findToken,
      updateToken,
      createToken,
      deleteTokens,
    });

    await mcpManager.mapAvailableTools(app.locals.availableTools);
    logger.info('MCP servers initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize MCP servers:', error);
  }
}

module.exports = initializeMCP;
