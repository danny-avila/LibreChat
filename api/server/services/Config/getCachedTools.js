const { randomUUID } = require('crypto');
const { CacheKeys, Time } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const { cacheConfig, ioredisClient, keyvRedisClient } = require('@librechat/api');
const getLogStores = require('~/cache/getLogStores');

const GLOBAL_TOOLS_LOCK_KEY = `${CacheKeys.TOOL_CACHE}:tools:global:write-lock`;
const GLOBAL_TOOLS_LOCK_TTL_MS = 30_000;
const GLOBAL_TOOLS_LOCK_WAIT_MS = 5_000;
const GLOBAL_TOOLS_LOCK_RETRY_MS = 25;
const RELEASE_GLOBAL_TOOLS_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/**
 * Cache key generators for different tool access patterns
 */
const ToolCacheKeys = {
  /** Global tools available to all users */
  GLOBAL: 'tools:global',
  /** App servers with an authoritative cached catalog, including an empty one */
  MCP_APP_SERVER_SNAPSHOTS: 'tools:mcp:app:snapshots',
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
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
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
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  const { userId, serverName, ttl = Time.TWELVE_HOURS } = options;

  // Cache by MCP server if specified (requires userId)
  if (serverName && userId) {
    return await cache.set(ToolCacheKeys.MCP_SERVER(userId, serverName), tools, ttl);
  }

  // Default to global cache
  await cache.delete(ToolCacheKeys.MCP_APP_SERVER_SNAPSHOTS);
  return await cache.set(ToolCacheKeys.GLOBAL, tools, ttl);
}

/** Returns app servers whose global tool slice is an authoritative snapshot. */
async function getCachedAppServerSnapshots() {
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  const serverNames = await cache.get(ToolCacheKeys.MCP_APP_SERVER_SNAPSHOTS);
  return Array.isArray(serverNames) ? serverNames : null;
}

/** Replaces the authoritative app-server snapshot index. */
async function setCachedAppServerSnapshots(serverNames, ttl = Time.TWELVE_HOURS) {
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  return await cache.set(ToolCacheKeys.MCP_APP_SERVER_SNAPSHOTS, serverNames, ttl);
}

/** Serializes aggregate global-tool read/modify/write operations across Redis-backed workers. */
async function runWithGlobalCacheLock(operation) {
  const usesSharedRedis =
    ioredisClient != null &&
    keyvRedisClient != null &&
    !cacheConfig.FORCED_IN_MEMORY_CACHE_NAMESPACES?.includes(CacheKeys.TOOL_CACHE);
  if (!usesSharedRedis) {
    return operation();
  }

  const token = randomUUID();
  const deadline = Date.now() + GLOBAL_TOOLS_LOCK_WAIT_MS;
  while (true) {
    const acquired = await ioredisClient.set(
      GLOBAL_TOOLS_LOCK_KEY,
      token,
      'PX',
      GLOBAL_TOOLS_LOCK_TTL_MS,
      'NX',
    );
    if (acquired === 'OK') {
      break;
    }
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for the global tool cache write lock');
    }
    await new Promise((resolve) => setTimeout(resolve, GLOBAL_TOOLS_LOCK_RETRY_MS));
  }

  try {
    return await operation();
  } finally {
    try {
      await ioredisClient.eval(RELEASE_GLOBAL_TOOLS_LOCK_SCRIPT, 1, GLOBAL_TOOLS_LOCK_KEY, token);
    } catch (error) {
      logger.warn('[MCP Cache] Failed to release the global tool cache write lock:', error);
    }
  }
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
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  const { userId, serverName, invalidateGlobal = false } = options;

  const keysToDelete = [];

  if (invalidateGlobal) {
    keysToDelete.push(ToolCacheKeys.GLOBAL, ToolCacheKeys.MCP_APP_SERVER_SNAPSHOTS);
  }

  if (serverName && userId) {
    keysToDelete.push(ToolCacheKeys.MCP_SERVER(userId, serverName));
  }

  await Promise.all(keysToDelete.map((key) => cache.delete(key)));
}

module.exports = {
  ToolCacheKeys,
  getCachedTools,
  setCachedTools,
  getCachedAppServerSnapshots,
  setCachedAppServerSnapshots,
  runWithGlobalCacheLock,
  invalidateCachedTools,
};
