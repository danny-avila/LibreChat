const { logger } = require('@librechat/data-schemas');
const { getCachedTools, setCachedTools } = require('./Config');
const { CacheKeys } = require('librechat-data-provider');
const { createMCPManager } = require('~/config');
const { getLogStores } = require('~/cache');

/**
 * Initialize MCP servers
 * @param {import('express').Application} app - Express app instance
 */
async function initializeMCPs(app) {
  const mcpServers = app.locals.mcpConfig;
  if (!mcpServers) {
    return;
  }

  const mcpManager = await createMCPManager(mcpServers);

  try {
    delete app.locals.mcpConfig;
    const cachedTools = await getCachedTools();

    if (!cachedTools) {
      logger.warn('No available tools found in cache during MCP initialization');
      return;
    }

    const mcpTools = mcpManager.getAppToolFunctions() ?? {};
    await setCachedTools({ ...cachedTools, ...mcpTools }, { isGlobal: true });

    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.delete(CacheKeys.TOOLS);
    logger.debug('Cleared tools array cache after MCP initialization');

    logger.info('MCP servers initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize MCP servers:', error);
  }
}

module.exports = initializeMCPs;
