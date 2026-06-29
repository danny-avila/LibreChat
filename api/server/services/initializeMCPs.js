const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { mergeAppTools, getAppConfig } = require('./Config');
const { createMCPServersRegistry, createMCPManager } = require('~/config');

/**
 * Resolves the current request's effective MCP allowlists from the merged (tenant-scoped)
 * config. The registry calls this per inspection/connection so admin-panel `mcpSettings`
 * overrides are honored without a restart. Tenant comes from the ALS context inside
 * `getAppConfig`; `userId`/`role` pick up user/role-scoped overrides when an actor exists.
 * @param {{ userId?: string, role?: string }} [ctx]
 */
async function resolveMCPAllowlists(ctx) {
  const appConfig = await getAppConfig({ role: ctx?.role, userId: ctx?.userId });
  return {
    allowedDomains: appConfig?.mcpSettings?.allowedDomains,
    allowedAddresses: appConfig?.mcpSettings?.allowedAddresses,
  };
}

/**
 * Initialize MCP servers
 */
async function initializeMCPs() {
  const appConfig = await getAppConfig({ baseOnly: true });
  const mcpServers = appConfig.mcpConfig;

  try {
    createMCPServersRegistry(
      mongoose,
      appConfig?.mcpSettings?.allowedDomains,
      appConfig?.mcpSettings?.allowedAddresses,
      resolveMCPAllowlists,
      appConfig?.mcpSettings?.apps,
    );
  } catch (error) {
    logger.error('[MCP] Failed to initialize MCPServersRegistry:', error);
    throw error;
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
