const { logger } = require('@librechat/data-schemas');
const { getCachedTools, setCachedTools, getAppConfig } = require('./Config');
const { CacheKeys } = require('librechat-data-provider');
const { createMCPManager } = require('~/config');
const { getLogStores } = require('~/cache');

/**
 * Initialize MCP servers
 */
async function initializeMCPs() {
  const appConfig = await getAppConfig();
  const mcpServers = appConfig.mcpConfig;
  if (!mcpServers) {
    return;
  }

  const mcpManager = await createMCPManager(mcpServers);

  try {
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
