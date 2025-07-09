const KeyvRedis = require('@keyv/redis').default;
const { Keyv } = require('keyv');
const { cacheConfig } = require('./cacheConfig');
const { keyvRedisClient, ioredisClient, GLOBAL_PREFIX_SEPARATOR } = require('./redisClients');
const { Time } = require('librechat-data-provider');
const ConnectRedis = require('connect-redis').default;
const MemoryStore = require('memorystore')(require('express-session'));
const { violationFile } = require('./keyvFiles');
const { RedisStore } = require('rate-limit-redis');

const redisCache = (namespace, ttl = undefined, fallbackStore = undefined) => {
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

const violationCache = (namespace, ttl = undefined) => {
  return redisCache(`violations:${namespace}`, ttl, violationFile);
};

const sessionCache = (namespace, ttl = undefined) => {
  namespace = namespace.endsWith(':') ? namespace : `${namespace}:`;
  if (!cacheConfig.USE_REDIS) return new MemoryStore({ ttl, checkPeriod: Time.ONE_DAY });
  return new ConnectRedis({ client: ioredisClient, ttl, prefix: namespace });
};

const sendCommand = (...args) => ioredisClient?.call(...args);
const limiterCache = (prefix) => {
  if (!prefix) throw new Error('prefix is required');
  if (!cacheConfig.USE_REDIS) return undefined;
  prefix = prefix.endsWith(':') ? prefix : `${prefix}:`;
  return new RedisStore({ sendCommand, prefix });
};

module.exports = { redisCache, sessionCache, violationCache, limiterCache };
