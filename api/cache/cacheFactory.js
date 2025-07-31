const KeyvRedis = require('@keyv/redis').default;
const { Keyv } = require('keyv');
const { RedisStore } = require('rate-limit-redis');
const { Time } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const { RedisStore: ConnectRedis } = require('connect-redis');
const MemoryStore = require('memorystore')(require('express-session'));
const { keyvRedisClient, ioredisClient, GLOBAL_PREFIX_SEPARATOR } = require('./redisClients');
const { cacheConfig } = require('./cacheConfig');
const { violationFile } = require('./keyvFiles');

/**
 * Creates a cache instance using Redis or a fallback store. Suitable for general caching needs.
 * @param {string} namespace - The cache namespace.
 * @param {number} [ttl] - Time to live for cache entries.
 * @param {object} [fallbackStore] - Optional fallback store if Redis is not used.
 * @returns {Keyv} Cache instance.
 */
const standardCache = (namespace, ttl = undefined, fallbackStore = undefined) => {
  if (
    cacheConfig.USE_REDIS &&
    !cacheConfig.FORCED_IN_MEMORY_CACHE_NAMESPACES?.includes(namespace)
  ) {
    try {
      const keyvRedis = new KeyvRedis(keyvRedisClient);
      const cache = new Keyv(keyvRedis, { namespace, ttl });
      keyvRedis.namespace = cacheConfig.REDIS_KEY_PREFIX;
      keyvRedis.keyPrefixSeparator = GLOBAL_PREFIX_SEPARATOR;

      cache.on('error', (err) => {
        logger.error(`Cache error in namespace ${namespace}:`, err);
      });

      return cache;
    } catch (err) {
      logger.error(`Failed to create Redis cache for namespace ${namespace}:`, err);
      throw err;
    }
  }
  if (fallbackStore) return new Keyv({ store: fallbackStore, namespace, ttl });
  return new Keyv({ namespace, ttl });
};

/**
 * Creates a cache instance for storing violation data.
 * Uses a file-based fallback store if Redis is not enabled.
 * @param {string} namespace - The cache namespace for violations.
 * @param {number} [ttl] - Time to live for cache entries.
 * @returns {Keyv} Cache instance for violations.
 */
const violationCache = (namespace, ttl = undefined) => {
  return standardCache(`violations:${namespace}`, ttl, violationFile);
};

/**
 * Creates a session cache instance using Redis or in-memory store.
 * @param {string} namespace - The session namespace.
 * @param {number} [ttl] - Time to live for session entries.
 * @returns {MemoryStore | ConnectRedis} Session store instance.
 */
const sessionCache = (namespace, ttl = undefined) => {
  namespace = namespace.endsWith(':') ? namespace : `${namespace}:`;
  if (!cacheConfig.USE_REDIS) return new MemoryStore({ ttl, checkPeriod: Time.ONE_DAY });
  const store = new ConnectRedis({ client: ioredisClient, ttl, prefix: namespace });
  if (ioredisClient) {
    ioredisClient.on('error', (err) => {
      logger.error(`Session store Redis error for namespace ${namespace}:`, err);
    });
  }
  return store;
};

/**
 * Creates a rate limiter cache using Redis.
 * @param {string} prefix - The key prefix for rate limiting.
 * @returns {RedisStore|undefined} RedisStore instance or undefined if Redis is not used.
 */
const limiterCache = (prefix) => {
  if (!prefix) throw new Error('prefix is required');
  if (!cacheConfig.USE_REDIS) return undefined;
  prefix = prefix.endsWith(':') ? prefix : `${prefix}:`;

  try {
    if (!ioredisClient) {
      logger.warn(`Redis client not available for rate limiter with prefix ${prefix}`);
      return undefined;
    }

    return new RedisStore({ sendCommand, prefix });
  } catch (err) {
    logger.error(`Failed to create Redis rate limiter for prefix ${prefix}:`, err);
    return undefined;
  }
};

const sendCommand = (...args) => {
  if (!ioredisClient) {
    logger.warn('Redis client not available for command execution');
    return Promise.reject(new Error('Redis client not available'));
  }

  return ioredisClient.call(...args).catch((err) => {
    logger.error('Redis command execution failed:', err);
    throw err;
  });
};

module.exports = { standardCache, sessionCache, violationCache, limiterCache };
