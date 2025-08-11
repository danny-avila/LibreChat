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

  // Filter out servers with startup: false
  const filteredServers = {};
  for (const [name, config] of Object.entries(mcpServers)) {
    if (config.startup === false) {
      logger.info(`Skipping MCP server '${name}' due to startup: false`);
      continue;
    }
    filteredServers[name] = config;
  }

  if (Object.keys(filteredServers).length === 0) {
    logger.info('[MCP] No MCP servers to initialize (all skipped or none configured)');
    return;
  }

  logger.info('Initializing MCP servers...');
  const mcpManager = await createMCPManager(mcpServers);

  try {
    delete app.locals.mcpConfig;
    const cachedTools = await getCachedTools();

    if (!cachedTools) {
      logger.warn('No available tools found in cache during MCP initialization');
      return;
    }

    const mcpTools = mcpManager.getAppToolFunctions();
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
