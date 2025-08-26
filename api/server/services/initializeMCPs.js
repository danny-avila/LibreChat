const { logger } = require('@librechat/data-schemas');
const { createMCPManager } = require('~/config');
const { mergeAppTools } = require('./Config');

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
