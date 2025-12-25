const { CacheKeys, Time } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');

/**
 * Cache key generators for different tool access patterns
 */
const ToolCacheKeys = {
  /** Global tools available to all users */
  GLOBAL: 'tools:global',
  /** MCP tools cached by user ID and server name */
  MCP_SERVER: (userId, serverName) => `tools:mcp:${userId}:${serverName}`,
};

/**
 * Retrieves available tools from cache
 * @function getCachedTools
 * @param {Object} options - Options for retrieving tools
 * @param {string} [options.userId] - User ID for user-specific MCP tools
 * @param {string} [options.serverName] - MCP server name to get cached tools for
 * @returns {Promise<LCAvailableTools|null>} The available tools object or null if not cached
 */
async function getCachedTools(options = {}) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const { userId, serverName } = options;

  // Return MCP server-specific tools if requested
  if (serverName && userId) {
    return await cache.get(ToolCacheKeys.MCP_SERVER(userId, serverName));
  }

  // Default to global tools
  return await cache.get(ToolCacheKeys.GLOBAL);
}

/**
 * Sets available tools in cache
 * @function setCachedTools
 * @param {Object} tools - The tools object to cache
 * @param {Object} options - Options for caching tools
 * @param {string} [options.userId] - User ID for user-specific MCP tools
 * @param {string} [options.serverName] - MCP server name for server-specific tools
 * @param {number} [options.ttl] - Time to live in milliseconds (default: 12 hours)
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function setCachedTools(tools, options = {}) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const { userId, serverName, ttl = Time.TWELVE_HOURS } = options;

  // Cache by MCP server if specified (requires userId)
  if (serverName && userId) {
    return await cache.set(ToolCacheKeys.MCP_SERVER(userId, serverName), tools, ttl);
  }

  // Default to global cache
  return await cache.set(ToolCacheKeys.GLOBAL, tools, ttl);
}

/**
 * Invalidates cached tools
 * @function invalidateCachedTools
 * @param {Object} options - Options for invalidating tools
 * @param {string} [options.userId] - User ID for user-specific MCP tools
 * @param {string} [options.serverName] - MCP server name to invalidate
 * @param {boolean} [options.invalidateGlobal=false] - Whether to invalidate global tools
 * @returns {Promise<void>}
 */
async function invalidateCachedTools(options = {}) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const { userId, serverName, invalidateGlobal = false } = options;

  const keysToDelete = [];

  if (invalidateGlobal) {
    keysToDelete.push(ToolCacheKeys.GLOBAL);
  }

  if (serverName && userId) {
    keysToDelete.push(ToolCacheKeys.MCP_SERVER(userId, serverName));
  }

  await Promise.all(keysToDelete.map((key) => cache.delete(key)));
}

/**
 * Gets MCP tools for a specific server from cache
 * @function getMCPServerTools
 * @param {string} userId - The user ID
 * @param {string} serverName - The MCP server name
 * @returns {Promise<LCAvailableTools|null>} The available tools for the server
 */
async function getMCPServerTools(userId, serverName) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const serverTools = await cache.get(ToolCacheKeys.MCP_SERVER(userId, serverName));

  if (serverTools) {
    return serverTools;
  }

  return null;
}

module.exports = {
  ToolCacheKeys,
  getCachedTools,
  setCachedTools,
  getMCPServerTools,
  invalidateCachedTools,
};
