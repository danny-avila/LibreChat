/**
 * @keyv/redis exports its default class in a non-standard way:
 * module.exports = { default: KeyvRedis, ... } instead of module.exports = KeyvRedis
 * This breaks ES6 imports when the module is marked as external in rollup.
 * We must use require() to access the .default property directly.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const KeyvRedis = require('@keyv/redis').default as typeof import('@keyv/redis').default;
import { Keyv } from 'keyv';
import createMemoryStore from 'memorystore';
import { RedisStore } from 'rate-limit-redis';
import { Time } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import session, { MemoryStore } from 'express-session';
import { RedisStore as ConnectRedis } from 'connect-redis';
import type { SendCommandFn } from 'rate-limit-redis';
import { keyvRedisClient, ioredisClient, GLOBAL_PREFIX_SEPARATOR } from './redisClients';
import { cacheConfig } from './cacheConfig';
import { violationFile } from './keyvFiles';

/**
 * Creates a cache instance using Redis or a fallback store. Suitable for general caching needs.
 * @param namespace - The cache namespace.
 * @param ttl - Time to live for cache entries.
 * @param fallbackStore - Optional fallback store if Redis is not used.
 * @returns Cache instance.
 */
export const standardCache = (namespace: string, ttl?: number, fallbackStore?: object): Keyv => {
  if (keyvRedisClient && !cacheConfig.FORCED_IN_MEMORY_CACHE_NAMESPACES?.includes(namespace)) {
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
  if (fallbackStore) {
    return new Keyv({ store: fallbackStore, namespace, ttl });
  }
  return new Keyv({ namespace, ttl });
};

/**
 * Creates a cache instance for storing violation data.
 * Uses a file-based fallback store if Redis is not enabled.
 * @param namespace - The cache namespace for violations.
 * @param ttl - Time to live for cache entries.
 * @returns Cache instance for violations.
 */
export const violationCache = (namespace: string, ttl?: number): Keyv => {
  return standardCache(`violations:${namespace}`, ttl, violationFile);
};

/**
 * Creates a session cache instance using Redis or in-memory store.
 * @param namespace - The session namespace.
 * @param ttl - Time to live for session entries.
 * @returns Session store instance.
 */
export const sessionCache = (namespace: string, ttl?: number): MemoryStore | ConnectRedis => {
  namespace = namespace.endsWith(':') ? namespace : `${namespace}:`;
  if (!cacheConfig.USE_REDIS) {
    const MemoryStore = createMemoryStore(session);
    return new MemoryStore({ ttl, checkPeriod: Time.ONE_DAY });
  }
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
 * @param prefix - The key prefix for rate limiting.
 * @returns RedisStore instance or undefined if Redis is not used.
 */
export const limiterCache = (prefix: string): RedisStore | undefined => {
  if (!prefix) {
    throw new Error('prefix is required');
  }
  if (!cacheConfig.USE_REDIS) {
    return undefined;
  }
  // TODO: The prefix is not actually applied. Also needs to account for global prefix.
  prefix = prefix.endsWith(':') ? prefix : `${prefix}:`;

  try {
    const sendCommand: SendCommandFn = (async (...args: string[]) => {
      if (ioredisClient == null) {
        throw new Error('Redis client not available');
      }
      try {
        return await ioredisClient.call(args[0], ...args.slice(1));
      } catch (err) {
        logger.error('Redis command execution failed:', err);
        throw err;
      }
    }) as SendCommandFn;
    return new RedisStore({ sendCommand, prefix });
  } catch (err) {
    logger.error(`Failed to create Redis rate limiter for prefix ${prefix}:`, err);
    return undefined;
  }
};
