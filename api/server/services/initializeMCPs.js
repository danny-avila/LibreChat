const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { mergeAppTools, getAppConfig } = require('./Config');
const { createMCPServersRegistry, createMCPManager } = require('~/config');

/**
 * Initialize MCP servers
 */
async function initializeMCPs() {
  const baseConfig = await getAppConfig({ baseOnly: true });
  const mcpServers = baseConfig.mcpConfig;

  let registry;
  try {
    registry = createMCPServersRegistry(
      mongoose,
      baseConfig?.mcpSettings?.allowedDomains,
      baseConfig?.mcpSettings?.allowedAddresses,
    );
  } catch (error) {
    logger.error('[MCP] Failed to initialize MCPServersRegistry:', error);
    throw error;
  }

  // Seed the registry's effective allowlists from the merged (admin-panel) config so a
  // pre-existing mcpSettings override is honored from boot, not just after the next
  // config change. Falls back to the YAML allowlists set above when the merged read fails.
  try {
    const mergedConfig = await getAppConfig();
    registry.setAllowlists(
      mergedConfig?.mcpSettings?.allowedDomains,
      mergedConfig?.mcpSettings?.allowedAddresses,
    );
  } catch (error) {
    logger.warn(
      '[MCP] Failed to seed merged allowlists at boot; using YAML allowlists until next config change:',
      error,
    );
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
    throw error;
  }
}

module.exports = initializeMCPs;
