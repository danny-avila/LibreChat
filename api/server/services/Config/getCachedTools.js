const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');

/**
 * Cache key generators for different tool access patterns
 * These will support future permission-based caching
 */
const ToolCacheKeys = {
  /** Global tools available to all users */
  GLOBAL: 'tools:global',
  /** Tools available to a specific user */
  USER: (userId) => `tools:user:${userId}`,
  /** Tools available to a specific role */
  ROLE: (roleId) => `tools:role:${roleId}`,
  /** Tools available to a specific group */
  GROUP: (groupId) => `tools:group:${groupId}`,
  /** Combined effective tools for a user (computed from all sources) */
  EFFECTIVE: (userId) => `tools:effective:${userId}`,
};

/**
 * Retrieves available tools from cache
 * @function getCachedTools
 * @param {Object} options - Options for retrieving tools
 * @param {string} [options.userId] - User ID for user-specific tools
 * @param {string[]} [options.roleIds] - Role IDs for role-based tools
 * @param {string[]} [options.groupIds] - Group IDs for group-based tools
 * @param {boolean} [options.includeGlobal=true] - Whether to include global tools
 * @returns {Promise<LCAvailableTools|null>} The available tools object or null if not cached
 */
async function getCachedTools(options = {}) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const { userId, roleIds = [], groupIds = [], includeGlobal = true } = options;

  // For now, return global tools (current behavior)
  // This will be expanded to merge tools from different sources
  if (!userId && includeGlobal) {
    return await cache.get(ToolCacheKeys.GLOBAL);
  }

  // Future implementation will merge tools from multiple sources
  // based on user permissions, roles, and groups
  if (userId) {
    /** @type {LCAvailableTools | null} Check if we have pre-computed effective tools for this user */
    const effectiveTools = await cache.get(ToolCacheKeys.EFFECTIVE(userId));
    if (effectiveTools) {
      return effectiveTools;
    }

    /** @type {LCAvailableTools | null} Otherwise, compute from individual sources */
    const toolSources = [];

    if (includeGlobal) {
      const globalTools = await cache.get(ToolCacheKeys.GLOBAL);
      if (globalTools) {
        toolSources.push(globalTools);
      }
    }

    // User-specific tools
    const userTools = await cache.get(ToolCacheKeys.USER(userId));
    if (userTools) {
      toolSources.push(userTools);
    }

    // Role-based tools
    for (const roleId of roleIds) {
      const roleTools = await cache.get(ToolCacheKeys.ROLE(roleId));
      if (roleTools) {
        toolSources.push(roleTools);
      }
    }

    // Group-based tools
    for (const groupId of groupIds) {
      const groupTools = await cache.get(ToolCacheKeys.GROUP(groupId));
      if (groupTools) {
        toolSources.push(groupTools);
      }
    }

    // Merge all tool sources (for now, simple merge - future will handle conflicts)
    if (toolSources.length > 0) {
      return mergeToolSources(toolSources);
    }
  }

  return null;
}

/**
 * Sets available tools in cache
 * @function setCachedTools
 * @param {Object} tools - The tools object to cache
 * @param {Object} options - Options for caching tools
 * @param {string} [options.userId] - User ID for user-specific tools
 * @param {string} [options.roleId] - Role ID for role-based tools
 * @param {string} [options.groupId] - Group ID for group-based tools
 * @param {boolean} [options.isGlobal=false] - Whether these are global tools
 * @param {number} [options.ttl] - Time to live in milliseconds
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function setCachedTools(tools, options = {}) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const { userId, roleId, groupId, isGlobal = false, ttl } = options;

  let cacheKey;
  if (isGlobal || (!userId && !roleId && !groupId)) {
    cacheKey = ToolCacheKeys.GLOBAL;
  } else if (userId) {
    cacheKey = ToolCacheKeys.USER(userId);
  } else if (roleId) {
    cacheKey = ToolCacheKeys.ROLE(roleId);
  } else if (groupId) {
    cacheKey = ToolCacheKeys.GROUP(groupId);
  }

  if (!cacheKey) {
    throw new Error('Invalid cache key options provided');
  }

  return await cache.set(cacheKey, tools, ttl);
}

/**
 * Invalidates cached tools
 * @function invalidateCachedTools
 * @param {Object} options - Options for invalidating tools
 * @param {string} [options.userId] - User ID to invalidate
 * @param {string} [options.roleId] - Role ID to invalidate
 * @param {string} [options.groupId] - Group ID to invalidate
 * @param {boolean} [options.invalidateGlobal=false] - Whether to invalidate global tools
 * @param {boolean} [options.invalidateEffective=true] - Whether to invalidate effective tools
 * @returns {Promise<void>}
 */
async function invalidateCachedTools(options = {}) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const { userId, roleId, groupId, invalidateGlobal = false, invalidateEffective = true } = options;

  const keysToDelete = [];

  if (invalidateGlobal) {
    keysToDelete.push(ToolCacheKeys.GLOBAL);
  }

  if (userId) {
    keysToDelete.push(ToolCacheKeys.USER(userId));
    if (invalidateEffective) {
      keysToDelete.push(ToolCacheKeys.EFFECTIVE(userId));
    }
  }

  if (roleId) {
    keysToDelete.push(ToolCacheKeys.ROLE(roleId));
    // TODO: In future, invalidate all users with this role
  }

  if (groupId) {
    keysToDelete.push(ToolCacheKeys.GROUP(groupId));
    // TODO: In future, invalidate all users in this group
  }

  await Promise.all(keysToDelete.map((key) => cache.delete(key)));
}

/**
 * Computes and caches effective tools for a user
 * @function computeEffectiveTools
 * @param {string} userId - The user ID
 * @param {Object} context - Context containing user's roles and groups
 * @param {string[]} [context.roleIds=[]] - User's role IDs
 * @param {string[]} [context.groupIds=[]] - User's group IDs
 * @param {number} [ttl] - Time to live for the computed result
 * @returns {Promise<Object>} The computed effective tools
 */
async function computeEffectiveTools(userId, context = {}, ttl) {
  const { roleIds = [], groupIds = [] } = context;

  // Get all tool sources
  const tools = await getCachedTools({
    userId,
    roleIds,
    groupIds,
    includeGlobal: true,
  });

  if (tools) {
    // Cache the computed result
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.set(ToolCacheKeys.EFFECTIVE(userId), tools, ttl);
  }

  return tools;
}

/**
 * Merges multiple tool sources into a single tools object
 * @function mergeToolSources
 * @param {Object[]} sources - Array of tool objects to merge
 * @returns {Object} Merged tools object
 */
function mergeToolSources(sources) {
  // For now, simple merge that combines all tools
  // Future implementation will handle:
  // - Permission precedence (deny > allow)
  // - Tool property conflicts
  // - Metadata merging
  const merged = {};

  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue;
    }

    for (const [toolId, toolConfig] of Object.entries(source)) {
      // Simple last-write-wins for now
      // Future: merge based on permission levels
      merged[toolId] = toolConfig;
    }
  }

  return merged;
}

/**
 * Middleware-friendly function to get tools for a request
 * @function getToolsForRequest
 * @param {Object} req - Express request object
 * @returns {Promise<Object|null>} Available tools for the request
 */
async function getToolsForRequest(req) {
  const userId = req.user?.id;

  // For now, return global tools if no user
  if (!userId) {
    return getCachedTools({ includeGlobal: true });
  }

  // Future: Extract roles and groups from req.user
  const roleIds = req.user?.roles || [];
  const groupIds = req.user?.groups || [];

  return getCachedTools({
    userId,
    roleIds,
    groupIds,
    includeGlobal: true,
  });
}

module.exports = {
  ToolCacheKeys,
  getCachedTools,
  setCachedTools,
  getToolsForRequest,
  invalidateCachedTools,
  computeEffectiveTools,
};
