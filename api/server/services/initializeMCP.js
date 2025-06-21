const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { findToken, updateToken, createToken, deleteTokens } = require('~/models');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { getCachedTools, setCachedTools } = require('./Config');
const { getLogStores } = require('~/cache');

/**
 * Initialize MCP servers
 * @param {import('express').Application} app - Express app instance
 */
async function initializeMCP(app) {
  const mcpServers = app.locals.mcpConfig;
  if (!mcpServers) {
    return;
  }

  logger.info('Initializing MCP servers...');
  const mcpManager = getMCPManager();
  const flowsCache = getLogStores(CacheKeys.FLOWS);
  const flowManager = flowsCache ? getFlowStateManager(flowsCache) : null;

  try {
    await mcpManager.initializeMCP({
      mcpServers,
      flowManager,
      tokenMethods: {
        findToken,
        updateToken,
        createToken,
        deleteTokens,
      },
    });

    delete app.locals.mcpConfig;
    const availableTools = await getCachedTools();

    if (!availableTools) {
      logger.warn('No available tools found in cache during MCP initialization');
      return;
    }

    const toolsCopy = { ...availableTools };
    await mcpManager.mapAvailableTools(toolsCopy, flowManager);
    await setCachedTools(toolsCopy, { isGlobal: true });

    logger.info('MCP servers initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize MCP servers:', error);
  }
}

module.exports = initializeMCP;
