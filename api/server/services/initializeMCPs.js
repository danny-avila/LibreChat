const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { setMCPToolsChangedHandler } = require('@librechat/api');
const { mergeAppTools, getAppConfig } = require('./Config');
const { replaceAppServerTools, cacheMCPServerTools } = require('./Config/mcp');
const { createMCPServersRegistry, createMCPManager, getMCPManager } = require('~/config');

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
 * Refreshes one server's tools after it reported `notifications/tools/list_changed`.
 *
 * A server that builds tools at runtime is the case this exists for: without it the tool list
 * stayed frozen at connection time and only a restart picked up the change (#7117). The list is
 * re-fetched from the live connection and written over that server's cache entry, so tools that
 * disappeared stop being advertised too.
 */
async function refreshChangedServerTools({ serverName, userId }) {
  const mcpManager = getMCPManager();
  const serverTools = await mcpManager.getServerToolFunctions(userId ?? '', serverName);
  if (!serverTools) {
    logger.debug(
      `[MCP][${serverName}] Tool list changed but no connection answered; leaving the cache alone`,
    );
    return;
  }

  const toolCount = Object.keys(serverTools).length;
  if (userId) {
    await cacheMCPServerTools({ userId, serverName, serverTools });
  } else {
    await replaceAppServerTools({ serverName, serverTools });
  }
  logger.info(
    `[MCP][${serverName}] Tool list changed; refreshed ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}${userId ? ` for user ${userId}` : ''}`,
  );
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
    );
  } catch (error) {
    logger.error('[MCP] Failed to initialize MCPServersRegistry:', error);
    throw error;
  }

  try {
    const mcpManager = await createMCPManager(mcpServers || {});
    setMCPToolsChangedHandler(refreshChangedServerTools);

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
module.exports.refreshChangedServerTools = refreshChangedServerTools;
