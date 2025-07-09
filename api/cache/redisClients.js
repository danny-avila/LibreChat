const IoRedis = require('ioredis');
const logger = require('~/config/winston');
const { cacheConfig } = require('./cacheConfig');
const { createClient, createCluster } = require('@keyv/redis');

const GLOBAL_PREFIX_SEPARATOR = '::';

const urls = cacheConfig.REDIS_URI?.split(',').map((uri) => new URL(uri));
const username = urls?.[0].username || cacheConfig.REDIS_USERNAME;
const password = urls?.[0].password || cacheConfig.REDIS_PASSWORD;
const ca = cacheConfig.REDIS_CA;

/** @type {import('ioredis').Redis | import('ioredis').Cluster | null} */
let ioredisClient = null;
if (cacheConfig.USE_REDIS) {
  const redisOptions = {
    username: username,
    password: password,
    tls: ca ? { ca } : undefined,
    keyPrefix: `${cacheConfig.REDIS_KEY_PREFIX}${GLOBAL_PREFIX_SEPARATOR}`,
    maxListeners: cacheConfig.REDIS_MAX_LISTENERS,
  };

  ioredisClient =
    urls.length === 1
      ? new IoRedis(cacheConfig.REDIS_URI, redisOptions)
      : new IoRedis.Cluster(cacheConfig.REDIS_URI, { redisOptions });

  ioredisClient.on('error', (err) => logger.error(`IoRedis connection error: ${err}`));
}

/** @type {import('@keyv/redis').RedisClient | import('@keyv/redis').RedisCluster | null} */
let keyvRedisClient = null;
if (cacheConfig.USE_REDIS) {
  const redisOptions = { username, password, socket: { tls: ca != null, ca } };

  keyvRedisClient =
    urls.length === 1
      ? createClient({ url: cacheConfig.REDIS_URI, ...redisOptions })
      : createCluster({
          rootNodes: cacheConfig.REDIS_URI.split(',').map((url) => ({ url })),
          defaults: redisOptions,
        });

  keyvRedisClient.setMaxListeners(cacheConfig.REDIS_MAX_LISTENERS);
}

module.exports = { ioredisClient, keyvRedisClient, GLOBAL_PREFIX_SEPARATOR };
