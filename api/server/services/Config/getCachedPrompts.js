const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const { getMCPManager } = require('~/config');

/**
 * Cache key generators for different tool access patterns
 * These will support future permission-based caching
 */
const PromptCacheKeys = {
  /** Global promptss available to all users */
  GLOBAL: 'prompts:global',
  /** prompts available to a specific user */
  USER: (userId) => `prompts:user:${userId}`,
  /** prompts available to a specific role */
  ROLE: (roleId) => `prompts:role:${roleId}`,
  /** prompts available to a specific group */
  GROUP: (groupId) => `prompts:group:${groupId}`,
  /** Combined effective prompts for a user (computed from all sources) */
  EFFECTIVE: (userId) => `prompts:effective:${userId}`,
};

/**
 * Gets all MCP PROMPTS from all MCP connections
 * @param {MCPManager} mcpManager - The MCPManager instance
 * @returns {Promise<Object>} The available prompts object
 * @throws {Error} If an error occurs while fetching prompts*
 */
async function getMCPPrompts(mcpManager) {
  let availablePrompts = {};
  const connectionPromises = Array.from(mcpManager.connection).map(async ([key, connection]) => {
    let serverName = key;
    try {
      console.log(`Fetching prompts for: ${serverName}`);

      let mcpPrompts = await connection.fetchPrompts(serverName);

      // Process the prompts for this connection
      for (const prompt of mcpPrompts) {
        const name = `${serverName}:${prompt.name}`;
        availablePrompts[name] = {
          name: prompt.name,
          mcpServerName: serverName,
          description: prompt.description || '',
          arguments: Array.isArray(prompt.arguments) ? prompt.arguments : [],
          promptKey: name,
        };
      }
    } catch (error) {
      console.warn(`[MCP][${serverName}] Error fetching prompts`, error);
    }
  });

  // Wait for all connection processing to complete
  await Promise.all(connectionPromises);

  return availablePrompts;
}

/**
 * Gets all MCP PROMPTS from all MCP connections
 * @param {MCPManager} mcpManager - The MCPManager instance
 * @param {string} serverName - The name of the specific server
 * @returns {Promise<Object>} The available prompts object
 * @throws {Error} If an error occurs while fetching prompts*
 */
async function getServerMCPPrompt(mcpManager, searchName, promptName) {
  let availablePrompts = {};
  try {
    let cachedPrompts = await getCachedPrompts({ includeGlobal: true });
    console.log('cachedPrompts server', cachedPrompts);

    if (!cachedPrompts || !cachedPrompts[searchName]) {
      const searchSplit = searchName.split('_mcp_');
      if (searchSplit.length !== 2) {
        console.warn(`[MCP] Invalid search name format: ${searchName}`);
        return null;
      }

      const promptNameFromSearch = searchSplit[0];
      const serverName = searchSplit[1];
      const connection = mcpManager.connections.get(serverName);

      if (!connection) {
        console.warn(`[MCP] No connection found for server: ${serverName}`);
        return null;
      }

      console.log(`Fetching prompts for server: ${serverName}`);
      const mcpPrompts = await connection.fetchPrompts();

      // Find the specific prompt by name
      const targetPrompt = mcpPrompts.find((prompt) => prompt.name === promptNameFromSearch);

      if (!targetPrompt) {
        console.log(`Prompt "${promptNameFromSearch}" not found on server "${serverName}"`);
        return null;
      }

      // Create the entry for just this one prompt
      const promptKey = `${promptNameFromSearch}_mcp_${serverName}`;
      availablePrompts[promptKey] = {
        name: targetPrompt.name,
        mcpServerName: serverName,
        description: targetPrompt.description || '',
        arguments: Array.isArray(targetPrompt.arguments) ? targetPrompt.arguments : [],
        promptKey: promptKey,
      };
      return availablePrompts[promptKey];
    } else {
      // Use cached prompt
      const promptValues = cachedPrompts[searchName];
      if (!promptValues) {
        console.log(`Cached prompt "${searchName}" not found`);
        return null;
      }

      const serverName = searchName.split('_mcp_')[1];

      availablePrompts[searchName] = {
        name: promptValues.name,
        mcpServerName: serverName,
        description: promptValues.description || '',
        arguments: Array.isArray(promptValues.arguments) ? promptValues.arguments : [],
        promptKey: searchName,
      };
      return availablePrompts[searchName];
    }
  } catch (error) {
    console.warn(`[MCP][${searchName}] Error fetching prompt "${promptName}"`, error);
    return null;
  }
}

/**
 * Fetches prompts from MCP servers and caches them
 * @function fetchAndCachePrompts
 * @param {Object} options - Options for fetching prompts
 * @returns {Promise<Object|null>} The fetched and cached prompts
 */
async function fetchAndCachePrompts() {
  try {
    // Use the existing MCP manager to get prompts
    const mcpManager = getMCPManager();
    if (!mcpManager) {
      console.log('No MCP manager available');
      return null;
    }

    const mcpPrompts = mcpManager.getAppMCPPrompts() || {};
    if (Object.keys(mcpPrompts).length === 0) {
      console.log('No MCP prompts available from MCP manager');
      return null;
    }

    // Cache the prompts globally using the same method as initialization
    await setCachedPrompts(mcpPrompts, { isGlobal: true });
    console.log('Cached', Object.keys(mcpPrompts).length, 'prompts from MCP servers');

    return mcpPrompts;
  } catch (error) {
    console.error('Error fetching and caching prompts:', error);
    return null;
  }
}

/**
 * Retrieves available prompts from cache, fetching from MCP servers if not cached
 * @function getCachedPrompts
 * @param {Object} options - Options for retrieving prompts
 * @param {string} [options.userId] - User ID for user-specific prompts
 * @param {string[]} [options.roleIds] - Role IDs for role-based prompts
 * @param {string[]} [options.groupIds] - Group IDs for group-based prompts
 * @param {boolean} [options.includeGlobal=true] - Whether to include global prompts
 * @param {boolean} [options.skipAutoFetch=false] - Whether to skip automatic fetching if not cached
 * @returns {Promise<Object|null>} The available prompts object or null if not cached
 */
async function getCachedPrompts(options = {}) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const {
    userId,
    roleIds = [],
    groupIds = [],
    includeGlobal = true,
    skipAutoFetch = false,
  } = options;

  try {
    // For now, return global prompts (current behavior)
    // This will be expanded to merge prompts from different sources
    if (!userId && includeGlobal) {
      let globalPrompts = await cache.get(PromptCacheKeys.GLOBAL);

      // If no cached prompts and auto-fetch is enabled, try to fetch from MCP servers
      if (!globalPrompts && !skipAutoFetch) {
        console.log('No cached global prompts found, attempting to fetch from MCP servers...');
        globalPrompts = await fetchAndCachePrompts();
      }

      return globalPrompts;
    }

    // Future implementation will merge prompts from multiple sources
    // based on user permissions, roles, and groups
    if (userId) {
      // Check if we have pre-computed effective prompts for this user
      const effectivePrompts = await cache.get(PromptCacheKeys.EFFECTIVE(userId));
      if (effectivePrompts) {
        return effectivePrompts;
      }

      // Otherwise, compute from individual sources
      const promptSources = [];

      if (includeGlobal) {
        let globalPrompts = await cache.get(PromptCacheKeys.GLOBAL);

        // If no cached global prompts and auto-fetch is enabled, try to fetch from MCP servers
        if (!globalPrompts && !skipAutoFetch) {
          console.log('No cached global prompts found, attempting to fetch from MCP servers...');
          globalPrompts = await fetchAndCachePrompts();
        }

        if (globalPrompts && Object.keys(globalPrompts).length > 0) {
          promptSources.push(globalPrompts);
        }
      }

      // User-specific prompts
      const userPrompts = await cache.get(PromptCacheKeys.USER(userId));
      if (userPrompts && Object.keys(userPrompts).length > 0) {
        promptSources.push(userPrompts);
        console.log('Added user prompts to sources:', Object.keys(userPrompts).length, 'prompts');
      }

      // Role-based prompts
      for (const roleId of roleIds) {
        const rolePrompts = await cache.get(PromptCacheKeys.ROLE(roleId));
        if (rolePrompts && Object.keys(rolePrompts).length > 0) {
          promptSources.push(rolePrompts);
        }
      }

      // Group-based prompts
      for (const groupId of groupIds) {
        const groupPrompts = await cache.get(PromptCacheKeys.GROUP(groupId));
        if (groupPrompts && Object.keys(groupPrompts).length > 0) {
          promptSources.push(groupPrompts);
        }
      }

      // Merge all prompt sources (for now, simple merge - future will handle conflicts)
      if (promptSources.length > 0) {
        const mergedPrompts = mergePromptSources(promptSources);
        return mergedPrompts;
      }
    }

    console.log('No cached prompts found for options:', options);
    return null;
  } catch (error) {
    console.error('Error retrieving cached prompts:', error);
    return null;
  }
}

/**
 * Sets available tools in cache
 * @function setCachedPrompts
 * @param {Object} prompts - The tools object to cache
 * @param {Object} options - Options for caching tools
 * @param {string} [options.userId] - User ID for user-specific tools
 * @param {string} [options.roleId] - Role ID for role-based tools
 * @param {string} [options.groupId] - Group ID for group-based tools
 * @param {boolean} [options.isGlobal=false] - Whether these are global tools
 * @param {number} [options.ttl] - Time to live in milliseconds
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function setCachedPrompts(prompts, options = {}) {
  console.log('set cached prompts', prompts, options);
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const { userId, roleId, groupId, isGlobal = true, ttl } = options;

  let cacheKey;
  if (isGlobal || (!userId && !roleId && !groupId)) {
    cacheKey = PromptCacheKeys.GLOBAL;
  } else if (userId) {
    cacheKey = PromptCacheKeys.USER(userId);
  } else if (roleId) {
    cacheKey = PromptCacheKeys.ROLE(roleId);
  } else if (groupId) {
    cacheKey = PromptCacheKeys.GROUP(groupId);
  }

  if (!cacheKey) {
    throw new Error('Invalid cache key options provided');
  }

  return await cache.set(cacheKey, prompts, ttl);
}

/**
 * Invalidates cached prompts
 * @function invalidateCachedPrompts
 * @param {Object} options - Options for invalidating tools
 * @param {string} [options.userId] - User ID to invalidate
 * @param {string} [options.roleId] - Role ID to invalidate
 * @param {string} [options.groupId] - Group ID to invalidate
 * @param {boolean} [options.invalidateGlobal=false] - Whether to invalidate global tools
 * @param {boolean} [options.invalidateEffective=true] - Whether to invalidate effective tools
 * @returns {Promise<void>}
 */
async function invalidateCachedPrompts(options = {}) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const { userId, roleId, groupId, invalidateGlobal = false, invalidateEffective = true } = options;

  const keysToDelete = [];

  if (invalidateGlobal) {
    keysToDelete.push(PromptCacheKeys.GLOBAL);
  }

  if (userId) {
    keysToDelete.push(PromptCacheKeys.USER(userId));
    if (invalidateEffective) {
      keysToDelete.push(PromptCacheKeys.EFFECTIVE(userId));
    }
  }

  if (roleId) {
    keysToDelete.push(PromptCacheKeys.ROLE(roleId));
    // TODO: In future, invalidate all users with this role
  }

  if (groupId) {
    keysToDelete.push(PromptCacheKeys.GROUP(groupId));
    // TODO: In future, invalidate all users in this group
  }

  await Promise.all(keysToDelete.map((key) => cache.delete(key)));
}

/**
 * Merges app-level prompts with global prompts
 * @param {import('@librechat/api').LCAvailableMCPPrompts} appPrompts
 * @returns {Promise<void>}
 */
async function mergeAppPrompts(appPrompts) {
  try {
    const count = Object.keys(appPrompts).length;
    if (!count) {
      return;
    }
    const cachedPrompts = await getCachedPrompts({ includeGlobal: true, skipAutoFetch: true });
    console.log('cachedPrompts', cachedPrompts);
    const mergedPrompts = { ...cachedPrompts, ...appPrompts };
    await setCachedPrompts(mergedPrompts, { isGlobal: true });
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.delete(CacheKeys.MCP_PROMPTS);
    console.log(`Merged ${count} app-level prompts`);
  } catch (error) {
    console.error('Failed to merge app-level prompts:', error);
    throw error;
  }
}

/**
 * Computes and caches effective tools for a user
 * @function computeEffectivePrompts
 * @param {string} userId - The user ID
 * @param {Object} context - Context containing user's roles and groups
 * @param {string[]} [context.roleIds=[]] - User's role IDs
 * @param {string[]} [context.groupIds=[]] - User's group IDs
 * @param {number} [ttl] - Time to live for the computed result
 * @returns {Promise<Object>} The computed effective tools
 */
async function computeEffectivePrompts(userId, context = {}, ttl) {
  const { roleIds = [], groupIds = [] } = context;

  // Get all tool sources
  const prompts = await getCachedPrompts({
    userId,
    roleIds,
    groupIds,
    includeGlobal: true,
  });

  if (prompts) {
    // Cache the computed result
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.set(PromptCacheKeys.EFFECTIVE(userId), prompts, ttl);
  }

  return prompts;
}

/**
 * Merges multiple tool sources into a single tools object
 * @function mergePromptSources
 * @param {Object[]} sources - Array of tool objects to merge
 * @returns {Object} Merged tools object
 */
function mergePromptSources(sources) {
  // For now, simple merge that combines all prompts
  // Future implementation will handle:
  // - Permission precedence (deny > allow)
  // - Prompt property conflicts
  // - Metadata merging
  const merged = {};

  if (!Array.isArray(sources)) {
    console.warn('mergePromptSources: sources is not an array');
    return merged;
  }

  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue;
    }

    for (const [promptId, promptConfig] of Object.entries(source)) {
      if (promptConfig && typeof promptConfig === 'object') {
        // Simple last-write-wins for now
        // Future: merge based on permission levels
        merged[promptId] = promptConfig;
      }
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
async function getPromptsForRequest(req) {
  const userId = req.user?.id;

  // For now, return global tools if no user
  if (!userId) {
    return getCachedPrompts({ includeGlobal: true });
  }

  // Future: Extract roles and groups from req.user
  const roleIds = req.user?.roles || [];
  const groupIds = req.user?.groups || [];

  return getCachedPrompts({
    userId,
    roleIds,
    groupIds,
    includeGlobal: true,
  });
}

/**
 * MCP-specific cache key generators
 */
const MCPCacheKeys = {
  /** All MCP prompts for a user */
  ALL: (userId) => `mcp:prompts:all:${userId}`,
  /** MCP prompts for a specific server and user */
  SERVER: (userId, serverName) => `mcp:prompts:server:${userId}:${serverName}`,
  /** Specific MCP prompt for a user */
  PROMPT: (userId, serverName, promptName) => `mcp:prompts:${userId}:${serverName}:${promptName}`,
};

/**
 * Retrieves cached MCP prompts
 * @function getCachedMCPPrompts
 * @param {Object} options - Options for retrieving MCP prompts
 * @param {string} options.userId - User ID
 * @param {string} [options.serverName] - Optional server name to get prompts for specific server
 * @param {string} [options.promptName] - Optional prompt name to get a specific prompt
 * @returns {Promise<Object|null>} The cached MCP prompts or null if not found
 */
async function getCachedMCPPrompts(options = {}) {
  console.log('get cached prompts', options);
  const { userId, serverName, promptName } = options;
  if (!userId) {
    throw new Error('User ID is required for MCP prompts caching');
  }

  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  let cacheKey;
  if (promptName && serverName) {
    // Get specific prompt
    cacheKey = MCPCacheKeys.PROMPT(userId, serverName, promptName);
  } else if (serverName) {
    // Get all prompts for a specific server
    cacheKey = MCPCacheKeys.SERVER(userId, serverName);
  } else {
    // Get all MCP prompts for the user
    cacheKey = MCPCacheKeys.ALL(userId);
  }

  return await cache.get(cacheKey);
}

/**
 * Caches MCP prompts
 * @function setCachedMCPPrompts
 * @param {Object} prompts - The MCP prompts to cache
 * @param {Object} options - Caching options
 * @param {string} options.userId - User ID
 * @param {string} [options.serverName] - Optional server name if caching for specific server
 * @param {string} [options.promptName] - Optional prompt name if caching a specific prompt
 * @param {number} [options.ttl=1800000] - Time to live in milliseconds (default 30 minutes)
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function setCachedMCPPrompts(prompts, options = {}) {
  const { userId, serverName, promptName, ttl = 1800000 } = options;
  if (!userId) {
    throw new Error('User ID is required for MCP prompts caching');
  }

  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  let cacheKey;

  if (promptName && serverName) {
    // Cache specific prompt
    cacheKey = MCPCacheKeys.PROMPT(userId, serverName, promptName);
  } else if (serverName) {
    // Cache all prompts for a specific server
    cacheKey = MCPCacheKeys.SERVER(userId, serverName);
  } else {
    // Cache all MCP prompts for the user
    cacheKey = MCPCacheKeys.ALL(userId);
  }

  return await cache.set(cacheKey, prompts, ttl);
}

/**
 * Invalidates cached MCP prompts
 * @function invalidateCachedMCPPrompts
 * @param {Object} options - Options for invalidating cache
 * @param {string} options.userId - User ID
 * @param {string} [options.serverName] - Optional server name to invalidate specific server cache
 * @param {string} [options.promptName] - Optional prompt name to invalidate specific prompt
 * @param {boolean} [options.invalidateAll=false] - Whether to invalidate all MCP caches for this user
 * @returns {Promise<void>}
 */
async function invalidateCachedMCPPrompts(options = {}) {
  const { userId, serverName, promptName, invalidateAll = false } = options;
  if (!userId) {
    throw new Error('User ID is required for MCP prompts cache invalidation');
  }

  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const keysToDelete = [];

  if (invalidateAll) {
    // Simple approach: delete the all-prompts cache
    keysToDelete.push(MCPCacheKeys.ALL(userId));
  } else if (promptName && serverName) {
    // Delete specific prompt cache
    keysToDelete.push(MCPCacheKeys.PROMPT(userId, serverName, promptName));
  } else if (serverName) {
    // Delete server-specific cache
    keysToDelete.push(MCPCacheKeys.SERVER(userId, serverName));
  } else {
    // Default: delete all user's MCP prompts
    keysToDelete.push(MCPCacheKeys.ALL(userId));
  }

  await Promise.all(keysToDelete.map((key) => cache.delete(key)));
}

module.exports = {
  getMCPPrompts,
  PromptCacheKeys,
  getServerMCPPrompt,
  getCachedPrompts,
  setCachedPrompts,
  getPromptsForRequest,
  invalidateCachedPrompts,
  computeEffectivePrompts,
  invalidateCachedMCPPrompts,
  getCachedMCPPrompts,
  setCachedMCPPrompts,
  mergeAppPrompts,
  fetchAndCachePrompts,
};
