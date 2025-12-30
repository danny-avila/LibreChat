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

  // ALWAYS initialize MCPServersRegistry (required for UI-based MCP server management)
  // This must happen before the early return, as users can add MCP servers via the UI
  // even when no servers are configured in librechat.yaml
  try {
    createMCPServersRegistry(mongoose, appConfig?.mcpSettings?.allowedDomains);
  } catch (error) {
    logger.error('[MCP] Failed to initialize MCPServersRegistry:', error);
    throw error;
  }

  // ALWAYS initialize MCPManager (required for UI-based MCP server management)
  // Even without YAML servers, users can add MCP servers via the UI
  // The manager handles both YAML-configured and UI-created servers
  try {
    const mcpManager = await createMCPManager(mcpServers || {});

    // Only merge app-level tools if YAML-configured servers exist
    if (mcpServers && Object.keys(mcpServers).length > 0) {
      const mcpTools = (await mcpManager.getAppToolFunctions()) || {};
      await mergeAppTools(mcpTools);
      logger.info(
        `[MCP] Initialized with ${Object.keys(mcpServers).length} YAML servers and ${Object.keys(mcpTools).length} tools.`,
      );
    } else {
      logger.debug('[MCP] No YAML servers configured. MCPManager ready for UI-based servers.');
    }
  } catch (error) {
    logger.error('[MCP] Failed to initialize MCPManager:', error);
    throw error;
  }
}

module.exports = initializeMCPs;
