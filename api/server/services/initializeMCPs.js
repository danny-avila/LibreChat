const { logger } = require('@librechat/data-schemas');
const { mergeAppTools, getAppConfig, mergeAppPrompts } = require('./Config');
const { createMCPManager } = require('~/config');

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
    const mcpTools = (await mcpManager.getAppToolFunctions()) || {};
    await mergeAppTools(mcpTools);
    const mcpPrompts = mcpManager.getAppMCPPrompts() || {};
    await mergeAppPrompts(mcpPrompts);
    logger.debug('Cleared tools array cache after MCP initialization');

    logger.info(
      `MCP servers initialized successfully. Added ${Object.keys(mcpTools).length} MCP tools.`,
    );
  } catch (error) {
    logger.error('Failed to initialize MCP servers:', error);
  }
}

module.exports = initializeMCPs;
