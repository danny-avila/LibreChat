const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { mergeAppTools, getAppConfig } = require('./Config');
const { createMCPServersRegistry, createMCPManager } = require('~/config');

/**
 * Initialize MCP servers
 */
async function initializeMCPs() {
  const appConfig = await getAppConfig();
  const mcpServers = appConfig.mcpConfig;
  if (!mcpServers) {
    return;
  }

  // Initialize MCPServersRegistry first (required for MCPManager)
  // Pass allowedDomains from mcpSettings for domain validation
  try {
    createMCPServersRegistry(mongoose, appConfig?.mcpSettings?.allowedDomains);
  } catch (error) {
    logger.error('[MCP] Failed to initialize MCPServersRegistry:', error);
    throw error;
  }

  const mcpManager = await createMCPManager(mcpServers);

  try {
    const mcpTools = (await mcpManager.getAppToolFunctions()) || {};
    await mergeAppTools(mcpTools);

    logger.info(
      `MCP servers initialized successfully. Added ${Object.keys(mcpTools).length} MCP tools.`,
    );
  } catch (error) {
    logger.error('Failed to initialize MCP servers:', error);
  }
}

module.exports = initializeMCPs;
