const { createHash } = require('crypto');
const { getTenantId } = require('@librechat/data-schemas');
const { CacheKeys, Time } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');

/**
 * Cache key generators for different tool access patterns
 */
const ToolCacheKeys = {
  /** Global tools available to all users */
  GLOBAL: 'tools:global',
  /** MCP tools cached by user ID and server name */
  MCP_SERVER: (userId, serverName, tenantId = getTenantId()) => {
    const scope = `${tenantId ?? '__default_tenant__'}\u0000${userId}\u0000${serverName}`;
    const digest = createHash('sha256').update(scope).digest('base64url');
    return `tools:mcp:v2:${digest}`;
  },
  /** Scoped schema catalogs are isolated from legacy raw tool maps. */
  MCP_CATALOG: (userId, serverName, tenantId = getTenantId()) => {
    const scope = `${tenantId ?? '__default_tenant__'}\u0000${userId}\u0000${serverName}`;
    const digest = createHash('sha256').update(scope).digest('base64url');
    return `tools:mcp:catalog:v1:${digest}`;
  },
  /** Removed after the single-tenant v2 catalog migration window. */
  LEGACY_MCP_SERVER: (userId, serverName) => `tools:mcp:${userId}:${serverName}`,
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
  const { userId, serverName, tenantId = getTenantId() } = options;

  // Return MCP server-specific tools if requested
  if (serverName && userId) {
    const scoped = await cache.get(ToolCacheKeys.MCP_SERVER(userId, serverName, tenantId));
    if (scoped != null || tenantId != null) {
      return scoped;
    }
    return await cache.get(ToolCacheKeys.LEGACY_MCP_SERVER(userId, serverName));
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
  const { userId, serverName, tenantId = getTenantId(), ttl = Time.TWELVE_HOURS } = options;

  // Cache by MCP server if specified (requires userId)
  if (serverName && userId) {
    return await cache.set(ToolCacheKeys.MCP_SERVER(userId, serverName, tenantId), tools, ttl);
  }

  // Default to global cache
  return await cache.set(ToolCacheKeys.GLOBAL, tools, ttl);
}

/** Retrieves a scoped MCP tool-catalog envelope without consulting legacy raw maps. */
async function getCachedMCPServerCatalog(options) {
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  const { userId, serverName, tenantId = getTenantId() } = options;
  return await cache.get(ToolCacheKeys.MCP_CATALOG(userId, serverName, tenantId));
}

/** Stores a scoped MCP tool-catalog envelope separately from legacy raw maps. */
async function setCachedMCPServerCatalog(catalog, options) {
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  const { userId, serverName, tenantId = getTenantId(), ttl = Time.TWELVE_HOURS } = options;
  return await cache.set(ToolCacheKeys.MCP_CATALOG(userId, serverName, tenantId), catalog, ttl);
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
  const { userId, serverName, tenantId = getTenantId(), invalidateGlobal = false } = options;

  const keysToDelete = [];

  if (invalidateGlobal) {
    keysToDelete.push(ToolCacheKeys.GLOBAL);
  }

  if (serverName && userId) {
    keysToDelete.push(ToolCacheKeys.MCP_SERVER(userId, serverName, tenantId));
    keysToDelete.push(ToolCacheKeys.MCP_CATALOG(userId, serverName, tenantId));
    if (tenantId == null) {
      keysToDelete.push(ToolCacheKeys.LEGACY_MCP_SERVER(userId, serverName));
    }
  }

  await Promise.all(keysToDelete.map((key) => cache.delete(key)));
}

module.exports = {
  ToolCacheKeys,
  getCachedTools,
  getCachedMCPServerCatalog,
  setCachedTools,
  setCachedMCPServerCatalog,
  invalidateCachedTools,
};
