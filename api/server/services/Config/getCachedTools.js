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
const MCP_SERVER_CACHE_ENTRY_VERSION = 1;
let globalToolsQueue = Promise.resolve();
const userToolsQueues = new Map();
const RELEASE_GLOBAL_TOOLS_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;
const RENEW_MCP_SERVER_GENERATION_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return 0
end
local decoded, value = pcall(cjson.decode, raw)
if not decoded or type(value) ~= 'table' or value['value'] ~= ARGV[1] then
  return 0
end
value['expires'] = tonumber(ARGV[2])
redis.call('PSETEX', KEYS[1], ARGV[3], cjson.encode(value))
return 1
`;
const WRITE_MCP_SERVER_TOOLS_IF_CURRENT_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return 0
end
local decoded, value = pcall(cjson.decode, raw)
if not decoded or type(value) ~= 'table' or value['value'] ~= ARGV[1] then
  return 0
end
value['expires'] = tonumber(ARGV[2])
redis.call('PSETEX', KEYS[1], ARGV[3], cjson.encode(value))
local decodedEntry, entry = pcall(cjson.decode, ARGV[4])
if not decodedEntry then
  return redis.error_reply('Invalid MCP tools cache entry')
end
redis.call('PSETEX', KEYS[2], ARGV[6], cjson.encode({
  value = entry,
  expires = tonumber(ARGV[5]),
}))
return 1
`;

/**
 * Cache key generators for different tool access patterns
 */
const ToolCacheKeys = {
  /** Global tools available to all users */
  GLOBAL: 'tools:global',
  /** App tools addressed by the connection config that produced them. */
  MCP_APP_SERVER: (serverName, configGeneration) =>
    `tools:mcp:app:${encodeURIComponent(serverName)}:${encodeURIComponent(configGeneration)}`,
  /** MCP tools cached by user ID and server name */
  MCP_SERVER: (userId, serverName, configGeneration) =>
    configGeneration
      ? `tools:mcp:user:{${encodeURIComponent(userId)}:${encodeURIComponent(serverName)}}:${encodeURIComponent(configGeneration)}`
      : `tools:mcp:${userId}:${serverName}`,
  /** Leased generation fencing stale publications from replaced user connections */
  MCP_SERVER_GENERATION: (userId, serverName) =>
    `tools:metadata:mcp:user-generation:{${encodeURIComponent(userId)}:${encodeURIComponent(serverName)}}`,
};

function usesSharedRedisToolCache() {
  return (
    ioredisClient != null &&
    keyvRedisClient != null &&
    !cacheConfig.FORCED_IN_MEMORY_CACHE_NAMESPACES?.includes(CacheKeys.TOOL_CACHE)
  );
}

function getRawRedisToolCacheKey(key) {
  const namespacedKey = `${CacheKeys.TOOL_CACHE}:${key}`;
  return cacheConfig.REDIS_KEY_PREFIX
    ? `${cacheConfig.REDIS_KEY_PREFIX}${cacheConfig.GLOBAL_PREFIX_SEPARATOR ?? '::'}${namespacedKey}`
    : namespacedKey;
}

function isGenerationGuardedToolEntry(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.version === MCP_SERVER_CACHE_ENTRY_VERSION &&
    typeof value.publicationGeneration === 'string' &&
    value.tools != null &&
    typeof value.tools === 'object' &&
    !Array.isArray(value.tools)
  );
}

/** Atomically renews one generation lease without allowing an obsolete owner to restore it. */
async function renewGenerationIfCurrent(cache, key, publicationGeneration) {
  if (usesSharedRedisToolCache()) {
    const expiresAt = Date.now() + MCP_SERVER_GENERATION_TTL_MS;
    const renewed = await keyvRedisClient.eval(RENEW_MCP_SERVER_GENERATION_SCRIPT, {
      keys: [getRawRedisToolCacheKey(key)],
      arguments: [publicationGeneration, String(expiresAt), String(MCP_SERVER_GENERATION_TTL_MS)],
    });
    return Number(renewed) === 1;
  }

  const generation = await cache.get(key);
  if (generation !== publicationGeneration) {
    return false;
  }
  if ((await cache.set(key, generation, MCP_SERVER_GENERATION_TTL_MS)) === false) {
    throw new Error('Tool publication generation cache rejected the lease refresh');
  }
  return true;
}

/** Atomically renews a generation lease and stores its catalog in the same Redis slot. */
async function writeMCPServerToolsIfCurrent({
  cache,
  generationKey,
  toolsKey,
  guardedEntry,
  publicationGeneration,
  ttl,
}) {
  if (!usesSharedRedisToolCache()) {
    if (!(await renewGenerationIfCurrent(cache, generationKey, publicationGeneration))) {
      return false;
    }
    const written = await cache.set(toolsKey, guardedEntry, ttl);
    if (written === false) {
      throw new Error('Tool cache rejected the generation-guarded write');
    }
    return true;
  }

  const generationExpiresAt = Date.now() + MCP_SERVER_GENERATION_TTL_MS;
  const toolsExpiresAt = Date.now() + ttl;
  const written = await keyvRedisClient.eval(WRITE_MCP_SERVER_TOOLS_IF_CURRENT_SCRIPT, {
    keys: [getRawRedisToolCacheKey(generationKey), getRawRedisToolCacheKey(toolsKey)],
    arguments: [
      publicationGeneration,
      String(generationExpiresAt),
      String(MCP_SERVER_GENERATION_TTL_MS),
      JSON.stringify(guardedEntry),
      String(toolsExpiresAt),
      String(ttl),
    ],
  });
  return Number(written) === 1;
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
 * @param {string} [options.configGeneration] - Connection-config fingerprint for MCP tools
 * @returns {Promise<LCAvailableTools|null>} The available tools object or null if not cached
 */
async function getCachedTools(options = {}) {
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  const { userId, serverName, configGeneration } = options;

  // Return MCP server-specific tools if requested
  if (serverName && userId) {
    const toolsKey = ToolCacheKeys.MCP_SERVER(userId, serverName, configGeneration);
    let cached = await cache.get(toolsKey);
    if (cached == null && configGeneration) {
      cached = await runWithUserToolsQueue(userId, serverName, async () => {
        const current = await cache.get(toolsKey);
        if (current != null) {
          return current;
        }
        const legacy = await cache.get(ToolCacheKeys.MCP_SERVER(userId, serverName));
        if (legacy == null) {
          return null;
        }
        const generationKey = ToolCacheKeys.MCP_SERVER_GENERATION(userId, serverName);
        let publicationGeneration = await cache.get(generationKey);
        if (typeof publicationGeneration !== 'string' || publicationGeneration.length === 0) {
          publicationGeneration = randomUUID();
          if (
            (await cache.set(
              generationKey,
              publicationGeneration,
              MCP_SERVER_GENERATION_TTL_MS,
            )) === false
          ) {
            throw new Error('Tool publication generation cache rejected the migration fence');
          }
        }
        const migrated = {
          version: MCP_SERVER_CACHE_ENTRY_VERSION,
          publicationGeneration,
          tools: legacy,
        };
        if ((await cache.set(toolsKey, migrated, Time.TWELVE_HOURS)) === false) {
          throw new Error('Tool cache rejected the legacy user catalog migration');
        }
        return migrated;
      });
    }
    if (!isGenerationGuardedToolEntry(cached)) {
      return cached;
    }
    const generation = await cache.get(ToolCacheKeys.MCP_SERVER_GENERATION(userId, serverName));
    return generation === cached.publicationGeneration ? cached.tools : null;
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
 * @param {string} [options.configGeneration] - Connection-config fingerprint for MCP tools
 * @param {number} [options.ttl] - Time to live in milliseconds (default: 12 hours)
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function setCachedToolsWithinGlobalLock(tools, options = {}) {
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  const { userId, serverName, configGeneration, ttl = Time.TWELVE_HOURS } = options;

  // Cache by MCP server if specified (requires userId)
  if (serverName && userId) {
    return await cache.set(
      ToolCacheKeys.MCP_SERVER(userId, serverName, configGeneration),
      tools,
      ttl,
    );
  }

  // Default to global cache
  return await cache.set(ToolCacheKeys.GLOBAL, tools, ttl);
}

/** Sets tools while serializing writes for the addressed user/server or aggregate global scope. */
async function setCachedTools(tools, options = {}) {
  if (options.serverName && options.userId) {
    return runWithUserToolsQueue(options.userId, options.serverName, () =>
      setCachedToolsWithinGlobalLock(tools, options),
    );
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
    return renewGenerationIfCurrent(cache, key, publicationGeneration);
  });
}

/** Writes a user tool snapshot only while its originating connection still owns the generation. */
async function setCachedToolsIfCurrent(tools, options) {
  const {
    userId,
    serverName,
    configGeneration,
    publicationGeneration,
    ttl = Time.TWELVE_HOURS,
  } = options;
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  return runWithUserToolsQueue(userId, serverName, async () => {
    const generationKey = ToolCacheKeys.MCP_SERVER_GENERATION(userId, serverName);
    const guardedEntry = {
      version: MCP_SERVER_CACHE_ENTRY_VERSION,
      publicationGeneration,
      tools,
    };
    return await writeMCPServerToolsIfCurrent({
      cache,
      generationKey,
      toolsKey: ToolCacheKeys.MCP_SERVER(userId, serverName, configGeneration),
      guardedEntry,
      publicationGeneration,
      ttl,
    });
  });
}

/** Returns one app server's authoritative catalog for a specific connection config. */
async function getCachedAppServerTools(serverName, configGeneration) {
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  return await cache.get(ToolCacheKeys.MCP_APP_SERVER(serverName, configGeneration));
}

/** Writes one app server's catalog without contending with another config generation. */
async function setCachedAppServerTools(
  serverName,
  configGeneration,
  tools,
  ttl = Time.TWELVE_HOURS,
) {
  const cache = getLogStores(CacheKeys.TOOL_CACHE);
  return await cache.set(ToolCacheKeys.MCP_APP_SERVER(serverName, configGeneration), tools, ttl);
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
    keysToDelete.push(ToolCacheKeys.GLOBAL);
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
  getCachedAppServerTools,
  setCachedAppServerTools,
  runWithGlobalCacheLock,
  invalidateCachedTools,
};
