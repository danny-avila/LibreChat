const { logger } = require('@librechat/data-schemas');
const { CacheKeys, Constants } = require('librechat-data-provider');
const { getCachedTools, setCachedTools } = require('./getCachedTools');
const { getLogStores } = require('~/cache');

/**
 * Updates MCP tools in the cache for a specific server and user
 * @param {Object} params - Parameters for updating MCP tools
 * @param {string} params.userId - User ID
 * @param {string} params.serverName - MCP server name
 * @param {Array} params.tools - Array of tool objects from MCP server
 * @returns {Promise<LCAvailableTools>}
 */
async function updateMCPUserTools({ userId, serverName, tools }) {
  try {
    const userTools = await getCachedTools({ userId });

    const mcpDelimiter = Constants.mcp_delimiter;
    for (const key of Object.keys(userTools)) {
      if (key.endsWith(`${mcpDelimiter}${serverName}`)) {
        delete userTools[key];
      }
    }

    for (const tool of tools) {
      const name = `${tool.name}${Constants.mcp_delimiter}${serverName}`;
      userTools[name] = {
        type: 'function',
        ['function']: {
          name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      };
    }

    await setCachedTools(userTools, { userId });

    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.delete(CacheKeys.TOOLS);
    logger.debug(`[MCP Cache] Updated ${tools.length} tools for ${serverName} user ${userId}`);
    return userTools;
  } catch (error) {
    logger.error(`[MCP Cache] Failed to update tools for ${serverName}:`, error);
    throw error;
  }
}

/**
 * Merges app-level tools with global tools
 * @param {import('@librechat/api').LCAvailableTools} appTools
 * @returns {Promise<void>}
 */
async function mergeAppTools(appTools) {
  try {
    const count = Object.keys(appTools).length;
    if (!count) {
      return;
    }
    const cachedTools = await getCachedTools({ includeGlobal: true });
    const mergedTools = { ...cachedTools, ...appTools };
    await setCachedTools(mergedTools, { isGlobal: true });
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.delete(CacheKeys.TOOLS);
    logger.debug(`Merged ${count} app-level tools`);
  } catch (error) {
    logger.error('Failed to merge app-level tools:', error);
    throw error;
  }
}

/**
 * Merges user-level tools with global tools
 * @param {object} params
 * @param {string} params.userId
 * @param {Record<string, FunctionTool>} params.cachedUserTools
 * @param {import('@librechat/api').LCAvailableTools} params.userTools
 * @returns {Promise<void>}
 */
async function mergeUserTools({ userId, cachedUserTools, userTools }) {
  try {
    if (!userId) {
      return;
    }
    const count = Object.keys(userTools).length;
    if (!count) {
      return;
    }
    const cachedTools = cachedUserTools ?? (await getCachedTools({ userId }));
    const mergedTools = { ...cachedTools, ...userTools };
    await setCachedTools(mergedTools, { userId });
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.delete(CacheKeys.TOOLS);
    logger.debug(`Merged ${count} user-level tools`);
  } catch (error) {
    logger.error('Failed to merge user-level tools:', error);
    throw error;
  }
}

/**
 * Clears all MCP tools for a specific server
 * @param {Object} params - Parameters for clearing MCP tools
 * @param {string} [params.userId] - User ID (if clearing user-specific tools)
 * @param {string} params.serverName - MCP server name
 * @returns {Promise<void>}
 */
async function clearMCPServerTools({ userId, serverName }) {
  try {
    const tools = await getCachedTools({ userId, includeGlobal: !userId });

    // Remove all tools for this server
    const mcpDelimiter = Constants.mcp_delimiter;
    let removedCount = 0;
    for (const key of Object.keys(tools)) {
      if (key.endsWith(`${mcpDelimiter}${serverName}`)) {
        delete tools[key];
        removedCount++;
      }
    }

    if (removedCount > 0) {
      await setCachedTools(tools, userId ? { userId } : { isGlobal: true });

      const cache = getLogStores(CacheKeys.CONFIG_STORE);
      await cache.delete(CacheKeys.TOOLS);

      logger.debug(
        `[MCP Cache] Removed ${removedCount} tools for ${serverName}${userId ? ` user ${userId}` : ' (global)'}`,
      );
    }
  } catch (error) {
    logger.error(`[MCP Cache] Failed to clear tools for ${serverName}:`, error);
    throw error;
  }
}

module.exports = {
  mergeAppTools,
  mergeUserTools,
  updateMCPUserTools,
  clearMCPServerTools,
};
