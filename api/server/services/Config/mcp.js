const { logger } = require('@librechat/data-schemas');
const { CacheKeys, Constants } = require('librechat-data-provider');
const { getCachedTools, setCachedTools } = require('./getCachedTools');
const { getLogStores } = require('~/cache');

/**
 * Updates MCP tools in the cache for a specific server
 * @param {Object} params - Parameters for updating MCP tools
 * @param {string} params.serverName - MCP server name
 * @param {Array} params.tools - Array of tool objects from MCP server
 * @returns {Promise<LCAvailableTools>}
 */
async function updateMCPServerTools({ serverName, tools }) {
  try {
    const serverTools = {};
    const mcpDelimiter = Constants.mcp_delimiter;

    for (const tool of tools) {
      const name = `${tool.name}${mcpDelimiter}${serverName}`;
      serverTools[name] = {
        type: 'function',
        ['function']: {
          name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      };
    }

    await setCachedTools(serverTools, { serverName });

    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.delete(CacheKeys.TOOLS);
    logger.debug(`[MCP Cache] Updated ${tools.length} tools for server ${serverName}`);
    return serverTools;
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
    const cachedTools = await getCachedTools();
    const mergedTools = { ...cachedTools, ...appTools };
    await setCachedTools(mergedTools);
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.delete(CacheKeys.TOOLS);
    logger.debug(`Merged ${count} app-level tools`);
  } catch (error) {
    logger.error('Failed to merge app-level tools:', error);
    throw error;
  }
}

/**
 * Caches MCP server tools (no longer merges with global)
 * @param {object} params
 * @param {string} params.serverName
 * @param {import('@librechat/api').LCAvailableTools} params.serverTools
 * @returns {Promise<void>}
 */
async function cacheMCPServerTools({ serverName, serverTools }) {
  try {
    const count = Object.keys(serverTools).length;
    if (!count) {
      return;
    }
    // Only cache server-specific tools, no merging with global
    await setCachedTools(serverTools, { serverName });
    logger.debug(`Cached ${count} MCP server tools for ${serverName}`);
  } catch (error) {
    logger.error(`Failed to cache MCP server tools for ${serverName}:`, error);
    throw error;
  }
}

module.exports = {
  mergeAppTools,
  cacheMCPServerTools,
  updateMCPServerTools,
};
