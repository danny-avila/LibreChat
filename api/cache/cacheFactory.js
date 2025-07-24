const KeyvRedis = require('@keyv/redis').default;
const { Keyv } = require('keyv');
const { cacheConfig } = require('./cacheConfig');
const { keyvRedisClient, ioredisClient, GLOBAL_PREFIX_SEPARATOR } = require('./redisClients');
const { Time } = require('librechat-data-provider');
const { RedisStore: ConnectRedis } = require('connect-redis');
const MemoryStore = require('memorystore')(require('express-session'));
const { violationFile } = require('./keyvFiles');
const { RedisStore } = require('rate-limit-redis');

/**
 * Creates a cache instance using Redis or a fallback store. Suitable for general caching needs.
 * @param {string} namespace - The cache namespace.
 * @param {number} [ttl] - Time to live for cache entries.
 * @param {object} [fallbackStore] - Optional fallback store if Redis is not used.
 * @returns {Keyv} Cache instance.
 */
const standardCache = (namespace, ttl = undefined, fallbackStore = undefined) => {
  if (cacheConfig.USE_REDIS) {
    const keyvRedis = new KeyvRedis(keyvRedisClient);
    const cache = new Keyv(keyvRedis, { namespace, ttl });
    keyvRedis.namespace = cacheConfig.REDIS_KEY_PREFIX;
    keyvRedis.keyPrefixSeparator = GLOBAL_PREFIX_SEPARATOR;
    return cache;
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
  return new ConnectRedis({ client: ioredisClient, ttl, prefix: namespace });
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
  return new RedisStore({ sendCommand, prefix });
};
const sendCommand = (...args) => ioredisClient?.call(...args);

module.exports = { standardCache, sessionCache, violationCache, limiterCache };
