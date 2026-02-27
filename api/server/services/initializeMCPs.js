const { logger } = require('@librechat/data-schemas');
const { mergeAppTools, getAppConfig } = require('./Config');
const { createMCPServersRegistry, createMCPManager } = require('~/config');

/**
 * Initialize MCP servers
 */
async function initializeMCPs() {
  const appConfig = await getAppConfig();
  const mcpServers = appConfig.mcpConfig;

  try {
    createMCPServersRegistry(null, appConfig?.mcpSettings?.allowedDomains);
  } catch (error) {
    logger.error('[MCP] Failed to initialize MCPServersRegistry:', error);
    logger.warn('[MCP] Continuing without MCP servers registry - some features may be unavailable');
  }

  try {
    const mcpManager = await createMCPManager(mcpServers || {});

    if (mcpServers && Object.keys(mcpServers).length > 0) {
      const mcpTools = (await mcpManager.getAppToolFunctions()) || {};
      await mergeAppTools(mcpTools);
      const serverCount = Object.keys(mcpServers).length;
      const toolCount = Object.keys(mcpTools).length;
      logger.info(
        `[MCP] Initialized with ${serverCount} configured ${serverCount === 1 ? 'server' : 'servers'} and ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}.`,
      );
    } else {
      logger.debug('[MCP] No servers configured. MCPManager ready for UI-based servers.');
    }
  } catch (error) {
    logger.error('[MCP] Failed to initialize MCPManager:', error);
    logger.warn('[MCP] Continuing without MCP manager - some features may be unavailable');
  }
}

module.exports = initializeMCPs;
