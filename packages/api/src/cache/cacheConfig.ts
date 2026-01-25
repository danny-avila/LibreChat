import { readFileSync, existsSync } from 'fs';
import { logger } from '@librechat/data-schemas';
import { CacheKeys } from 'librechat-data-provider';
import { math, isEnabled } from '~/utils';

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

// USE_REDIS_STREAMS controls whether Redis is used for resumable stream job storage.
// Defaults to true if USE_REDIS is enabled but USE_REDIS_STREAMS is not explicitly set.
// Set to 'false' to use in-memory storage for streams while keeping Redis for other caches.
const USE_REDIS_STREAMS =
  process.env.USE_REDIS_STREAMS !== undefined
    ? isEnabled(process.env.USE_REDIS_STREAMS)
    : USE_REDIS;

// Comma-separated list of cache namespaces that should be forced to use in-memory storage
// even when Redis is enabled. This allows selective performance optimization for specific caches.
const FORCED_IN_MEMORY_CACHE_NAMESPACES = process.env.FORCED_IN_MEMORY_CACHE_NAMESPACES
  ? process.env.FORCED_IN_MEMORY_CACHE_NAMESPACES.split(',').map((key) => key.trim())
  : [];

// Validate against CacheKeys enum
if (FORCED_IN_MEMORY_CACHE_NAMESPACES.length > 0) {
  const validKeys = Object.values(CacheKeys) as string[];
  const invalidKeys = FORCED_IN_MEMORY_CACHE_NAMESPACES.filter((key) => !validKeys.includes(key));

  if (invalidKeys.length > 0) {
    throw new Error(
      `Invalid cache keys in FORCED_IN_MEMORY_CACHE_NAMESPACES: ${invalidKeys.join(', ')}. Valid keys: ${validKeys.join(', ')}`,
    );
  }
}

/** Helper function to safely read Redis CA certificate from file
 * @returns {string|null} The contents of the CA certificate file, or null if not set or on error
 */
const getRedisCA = (): string | null => {
  const caPath = process.env.REDIS_CA;
  if (!caPath) {
    return null;
  }

  try {
    if (existsSync(caPath)) {
      return readFileSync(caPath, 'utf8');
    } else {
      logger.warn(`Redis CA certificate file not found: ${caPath}`);
      return null;
    }
  } catch (error) {
    logger.error(`Failed to read Redis CA certificate file '${caPath}':`, error);
    return null;
  }
};

const cacheConfig = {
  FORCED_IN_MEMORY_CACHE_NAMESPACES,
  USE_REDIS,
  USE_REDIS_STREAMS,
  REDIS_URI: process.env.REDIS_URI,
  REDIS_USERNAME: process.env.REDIS_USERNAME,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_CA: getRedisCA(),
  REDIS_KEY_PREFIX: process.env[REDIS_KEY_PREFIX_VAR ?? ''] || REDIS_KEY_PREFIX || '',
  GLOBAL_PREFIX_SEPARATOR: '::',
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
  /** flag to modify redis connection by adding dnsLookup this is required when connecting to elasticache for ioredis
   * see "Special Note: Aws Elasticache Clusters with TLS" on this webpage:  https://www.npmjs.com/package/ioredis **/
  REDIS_USE_ALTERNATIVE_DNS_LOOKUP: isEnabled(process.env.REDIS_USE_ALTERNATIVE_DNS_LOOKUP),
  /** Enable redis cluster without the need of multiple URIs */
  USE_REDIS_CLUSTER: isEnabled(process.env.USE_REDIS_CLUSTER ?? 'false'),
  CI: isEnabled(process.env.CI),
  DEBUG_MEMORY_CACHE: isEnabled(process.env.DEBUG_MEMORY_CACHE),

  BAN_DURATION: math(process.env.BAN_DURATION, 7200000), // 2 hours

  /**
   * Number of keys to delete in each batch during Redis DEL operations.
   * In cluster mode, keys are deleted individually in parallel chunks to avoid CROSSSLOT errors.
   * In single-node mode, keys are deleted in batches using DEL with arrays.
   * Lower values reduce memory usage but increase number of Redis calls.
   * @default 1000
   */
  REDIS_DELETE_CHUNK_SIZE: math(process.env.REDIS_DELETE_CHUNK_SIZE, 1000),

  /**
   * Number of keys to update in each batch during Redis SET operations.
   * In cluster mode, keys are updated individually in parallel chunks to avoid CROSSSLOT errors.
   * In single-node mode, keys are updated in batches using transactions (multi/exec).
   * Lower values reduce memory usage but increase number of Redis calls.
   * @default 1000
   */
  REDIS_UPDATE_CHUNK_SIZE: math(process.env.REDIS_UPDATE_CHUNK_SIZE, 1000),

  /**
   * COUNT hint for Redis SCAN operations when scanning keys by pattern.
   * This is a hint to Redis about how many keys to scan in each iteration.
   * Higher values can reduce round trips but increase memory usage and latency per call.
   * Note: Redis may return more or fewer keys than this count depending on internal heuristics.
   * @default 1000
   */
  REDIS_SCAN_COUNT: math(process.env.REDIS_SCAN_COUNT, 1000),

  /**
   * TTL in milliseconds for MCP registry read-through cache.
   * This cache reduces redundant lookups within a single request flow.
   * @default 5000 (5 seconds)
   */
  MCP_REGISTRY_CACHE_TTL: math(process.env.MCP_REGISTRY_CACHE_TTL, 5000),
};

export { cacheConfig };
