const fs = require('fs');
const { math, isEnabled } = require('@librechat/api');
const { CacheKeys } = require('librechat-data-provider');

// To ensure that different deployments do not interfere with each other's cache, we use a prefix for the Redis keys.
// This prefix is usually the deployment ID, which is often passed to the container or pod as an env var.
// Set REDIS_KEY_PREFIX_VAR to the env var that contains the deployment ID.
const REDIS_KEY_PREFIX_VAR = process.env.REDIS_KEY_PREFIX_VAR;
const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX;
if (REDIS_KEY_PREFIX_VAR && REDIS_KEY_PREFIX) {
  throw new Error('Only either REDIS_KEY_PREFIX_VAR or REDIS_KEY_PREFIX can be set.');
}

const USE_REDIS = isEnabled(process.env.USE_REDIS);
if (USE_REDIS && !process.env.REDIS_URI) {
  throw new Error('USE_REDIS is enabled but REDIS_URI is not set.');
}

// Comma-separated list of cache namespaces that should be forced to use in-memory storage
// even when Redis is enabled. This allows selective performance optimization for specific caches.
const FORCED_IN_MEMORY_CACHE_NAMESPACES = process.env.FORCED_IN_MEMORY_CACHE_NAMESPACES
  ? process.env.FORCED_IN_MEMORY_CACHE_NAMESPACES.split(',').map((key) => key.trim())
  : [];

// Validate against CacheKeys enum
if (FORCED_IN_MEMORY_CACHE_NAMESPACES.length > 0) {
  const validKeys = Object.values(CacheKeys);
  const invalidKeys = FORCED_IN_MEMORY_CACHE_NAMESPACES.filter((key) => !validKeys.includes(key));

  if (invalidKeys.length > 0) {
    throw new Error(
      `Invalid cache keys in FORCED_IN_MEMORY_CACHE_NAMESPACES: ${invalidKeys.join(', ')}. Valid keys: ${validKeys.join(', ')}`,
    );
  }
}

const cacheConfig = {
  FORCED_IN_MEMORY_CACHE_NAMESPACES,
  USE_REDIS,
  REDIS_URI: process.env.REDIS_URI,
  REDIS_USERNAME: process.env.REDIS_USERNAME,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_CA: process.env.REDIS_CA ? fs.readFileSync(process.env.REDIS_CA, 'utf8') : null,
  REDIS_KEY_PREFIX: process.env[REDIS_KEY_PREFIX_VAR] || REDIS_KEY_PREFIX || '',
  REDIS_MAX_LISTENERS: math(process.env.REDIS_MAX_LISTENERS, 40),
  REDIS_PING_INTERVAL: math(process.env.REDIS_PING_INTERVAL, 0),
  /** Max delay between reconnection attempts in ms */
  REDIS_RETRY_MAX_DELAY: math(process.env.REDIS_RETRY_MAX_DELAY, 3000),
  /** Max number of reconnection attempts (0 = infinite) */
  REDIS_RETRY_MAX_ATTEMPTS: math(process.env.REDIS_RETRY_MAX_ATTEMPTS, 10),
  /** Connection timeout in ms */
  REDIS_CONNECT_TIMEOUT: math(process.env.REDIS_CONNECT_TIMEOUT, 10000),
  /** Queue commands when disconnected */
  REDIS_ENABLE_OFFLINE_QUEUE: isEnabled(process.env.REDIS_ENABLE_OFFLINE_QUEUE ?? 'true'),
  /** Enable redis cluster without the need of multiple URIs */
  USE_REDIS_CLUSTER: isEnabled(process.env.USE_REDIS_CLUSTER ?? 'false'),
  CI: isEnabled(process.env.CI),
  DEBUG_MEMORY_CACHE: isEnabled(process.env.DEBUG_MEMORY_CACHE),

  BAN_DURATION: math(process.env.BAN_DURATION, 7200000), // 2 hours
};

module.exports = { cacheConfig };
