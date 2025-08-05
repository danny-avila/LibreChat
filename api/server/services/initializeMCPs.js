const { logger } = require('@librechat/data-schemas');
const { getCachedTools, setCachedTools, getAppConfig } = require('./Config');
const { CacheKeys } = require('librechat-data-provider');
const { createMCPManager } = require('~/config');
const { mergeAppTools } = require('./Config');

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
    const mcpTools = mcpManager.getAppToolFunctions() || {};
    await mergeAppTools(mcpTools);

    logger.info(
      `MCP servers initialized successfully. Added ${Object.keys(mcpTools).length} MCP tools.`,
    );
  } catch (error) {
    logger.error('Failed to initialize MCP servers:', error);
  }
}

module.exports = initializeMCPs;
