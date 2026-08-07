const { randomUUID } = require('crypto');
const { CacheKeys, Time } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const { cacheConfig, ioredisClient, keyvRedisClient, mcpConfig } = require('@librechat/api');
const getLogStores = require('~/cache/getLogStores');

const GLOBAL_TOOLS_LOCK_KEY = `${CacheKeys.TOOL_CACHE}:tools:global:write-lock`;
const GLOBAL_TOOLS_LOCK_TTL_MS = 30_000;
const GLOBAL_TOOLS_LOCK_RETRY_MS = 25;
const GLOBAL_TOOLS_LOCK_WAIT_MS = GLOBAL_TOOLS_LOCK_TTL_MS + GLOBAL_TOOLS_LOCK_RETRY_MS;
const USER_TOOLS_LOCK_TTL_MS = 30_000;
const USER_TOOLS_LOCK_WAIT_MS = USER_TOOLS_LOCK_TTL_MS + GLOBAL_TOOLS_LOCK_RETRY_MS;
const configuredUserConnectionIdleTimeout = Number(mcpConfig.USER_CONNECTION_IDLE_TIMEOUT);
const MCP_SERVER_GENERATION_TTL_MS = Math.max(
  Time.ONE_DAY,
  Number.isFinite(configuredUserConnectionIdleTimeout)
    ? configuredUserConnectionIdleTimeout * 2
    : 0,
);
let globalToolsQueue = Promise.resolve();
const userToolsQueues = new Map();
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
  /** Connection-config generations allowed to publish app-server tools */
  MCP_APP_SERVER_GENERATIONS: 'tools:metadata:mcp:app-server-generations',
  /** MCP tools cached by user ID and server name */
  MCP_SERVER: (userId, serverName) => `tools:mcp:${userId}:${serverName}`,
  /** Leased generation fencing stale publications from replaced user connections */
  MCP_SERVER_GENERATION: (userId, serverName) =>
    `tools:metadata:mcp:user-generation:${encodeURIComponent(userId)}:${encodeURIComponent(serverName)}`,
};

function usesSharedRedisToolCache() {
  return (
    ioredisClient != null &&
    keyvRedisClient != null &&
    !cacheConfig.FORCED_IN_MEMORY_CACHE_NAMESPACES?.includes(CacheKeys.TOOL_CACHE)
  );
}

async function runWithRedisCacheLock(lockKey, ttl, wait, operation) {
  if (!usesSharedRedisToolCache()) {
    return operation();
  }

  const token = randomUUID();
  const deadline = Date.now() + wait;
  while (true) {
    const acquired = await ioredisClient.set(lockKey, token, 'PX', ttl, 'NX');
    if (acquired === 'OK') {
      break;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for tool cache lock ${lockKey}`);
    }
    await new Promise((resolve) => setTimeout(resolve, GLOBAL_TOOLS_LOCK_RETRY_MS));
  }

  try {
    return await operation();
  } finally {
    try {
      await ioredisClient.eval(RELEASE_GLOBAL_TOOLS_LOCK_SCRIPT, 1, lockKey, token);
    } catch (error) {
      logger.warn(`[MCP Cache] Failed to release tool cache lock ${lockKey}:`, error);
    }
  }
}

function runWithUserToolsQueue(userId, serverName, operation) {
  const scope = JSON.stringify([userId, serverName]);
  const previous = userToolsQueues.get(scope) ?? Promise.resolve();
  const lockKey = `${CacheKeys.TOOL_CACHE}:tools:mcp-write-lock:${encodeURIComponent(userId)}:${encodeURIComponent(serverName)}`;
  const lockedOperation = () =>
    runWithRedisCacheLock(lockKey, USER_TOOLS_LOCK_TTL_MS, USER_TOOLS_LOCK_WAIT_MS, operation);
  const result = previous.then(lockedOperation, lockedOperation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  userToolsQueues.set(scope, tail);
  void tail.then(() => {
    if (userToolsQueues.get(scope) === tail) {
      userToolsQueues.delete(scope);
    }
  });
  return result;
}

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
async function setCachedToolsWithinGlobalLock(tools, options = {}) {
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

/** Sets tools while serializing aggregate global writes across Redis-backed workers. */
async function setCachedTools(tools, options = {}) {
  if (options.serverName && options.userId) {
    return setCachedToolsWithinGlobalLock(tools, options);
  }
  return runWithGlobalCacheLock(() => setCachedToolsWithinGlobalLock(tools, options));
}

/** Returns the leased generation a user connection must present when publishing tools. */
async function getMCPToolsCacheGeneration({ userId, serverName }) {
  if (!userId || !serverName) {
    return undefined;
  }
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  const key = ToolCacheKeys.MCP_SERVER_GENERATION(userId, serverName);
  const existing = await cache.get(key);
  if (typeof existing === 'string' && existing.length > 0) {
    return existing;
  }
  return runWithUserToolsQueue(userId, serverName, async () => {
    const current = await cache.get(key);
    if (typeof current === 'string' && current.length > 0) {
      return current;
    }
    const generation = randomUUID();
    if ((await cache.set(key, generation, MCP_SERVER_GENERATION_TTL_MS)) === false) {
      throw new Error('Tool publication generation cache rejected the write');
    }
    return generation;
  });
}

/** Extends a durable connection's lease only while it still owns the publication generation. */
async function renewMCPToolsCacheGeneration({ userId, serverName, publicationGeneration }) {
  if (!userId || !serverName || !publicationGeneration) {
    return false;
  }
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  return runWithUserToolsQueue(userId, serverName, async () => {
    const key = ToolCacheKeys.MCP_SERVER_GENERATION(userId, serverName);
    const generation = await cache.get(key);
    if (generation !== publicationGeneration) {
      return false;
    }
    if ((await cache.set(key, generation, MCP_SERVER_GENERATION_TTL_MS)) === false) {
      throw new Error('Tool publication generation cache rejected the lease refresh');
    }
    return true;
  });
}

/** Writes a user tool snapshot only while its originating connection still owns the generation. */
async function setCachedToolsIfCurrent(tools, options) {
  const { userId, serverName, publicationGeneration, ttl = Time.TWELVE_HOURS } = options;
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  return runWithUserToolsQueue(userId, serverName, async () => {
    const generation = await cache.get(ToolCacheKeys.MCP_SERVER_GENERATION(userId, serverName));
    if (generation !== publicationGeneration) {
      return false;
    }
    if (
      (await cache.set(
        ToolCacheKeys.MCP_SERVER_GENERATION(userId, serverName),
        generation,
        MCP_SERVER_GENERATION_TTL_MS,
      )) === false
    ) {
      throw new Error('Tool publication generation cache rejected the lease refresh');
    }
    const written = await cache.set(ToolCacheKeys.MCP_SERVER(userId, serverName), tools, ttl);
    if (written === false) {
      throw new Error('Tool cache rejected the generation-guarded write');
    }
    return true;
  });
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

/** Returns the app connection-config generations allowed to publish global tools. */
async function getCachedAppServerGenerations() {
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  const generations = await cache.get(ToolCacheKeys.MCP_APP_SERVER_GENERATIONS);
  return generations != null && typeof generations === 'object' && !Array.isArray(generations)
    ? generations
    : null;
}

/** Replaces app publication generations without expiring active, quiet connections. */
async function setCachedAppServerGenerations(generations) {
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  return await cache.set(ToolCacheKeys.MCP_APP_SERVER_GENERATIONS, generations);
}

/** Serializes aggregate global-tool read/modify/write operations across Redis-backed workers. */
async function runWithRedisGlobalCacheLock(operation) {
  return runWithRedisCacheLock(
    GLOBAL_TOOLS_LOCK_KEY,
    GLOBAL_TOOLS_LOCK_TTL_MS,
    GLOBAL_TOOLS_LOCK_WAIT_MS,
    operation,
  );
}

/** Serializes global cache operations within this process and, when configured, across Redis. */
function runWithGlobalCacheLock(operation) {
  const lockedOperation = () => runWithRedisGlobalCacheLock(operation);
  const result = globalToolsQueue.then(lockedOperation, lockedOperation);
  globalToolsQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
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
    keysToDelete.push(
      ToolCacheKeys.GLOBAL,
      ToolCacheKeys.MCP_APP_SERVER_SNAPSHOTS,
      ToolCacheKeys.MCP_APP_SERVER_GENERATIONS,
    );
  }

  const invalidate = () => Promise.all(keysToDelete.map((key) => cache.delete(key)));
  if (invalidateGlobal) {
    await runWithGlobalCacheLock(invalidate);
  }
  if (serverName && userId) {
    await runWithUserToolsQueue(userId, serverName, async () => {
      const generationKey = ToolCacheKeys.MCP_SERVER_GENERATION(userId, serverName);
      if ((await cache.set(generationKey, randomUUID(), MCP_SERVER_GENERATION_TTL_MS)) === false) {
        throw new Error('Tool publication generation cache rejected invalidation');
      }
      await cache.delete(ToolCacheKeys.MCP_SERVER(userId, serverName));
    });
  }
}

module.exports = {
  ToolCacheKeys,
  getCachedTools,
  setCachedTools,
  setCachedToolsIfCurrent,
  getMCPToolsCacheGeneration,
  renewMCPToolsCacheGeneration,
  setCachedToolsWithinGlobalLock,
  getCachedAppServerSnapshots,
  setCachedAppServerSnapshots,
  getCachedAppServerGenerations,
  setCachedAppServerGenerations,
  runWithGlobalCacheLock,
  invalidateCachedTools,
};
