const IoRedis = require('ioredis');
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

  // Pinging the Redis server every 5 minutes to keep the connection alive
  const pingInterval = setInterval(() => ioredisClient.ping(), 5 * 60 * 1000);
  ioredisClient.on('close', () => clearInterval(pingInterval));
  ioredisClient.on('end', () => clearInterval(pingInterval));
}

/** @type {import('@keyv/redis').RedisClient | import('@keyv/redis').RedisCluster | null} */
let keyvRedisClient = null;
if (cacheConfig.USE_REDIS) {
  // ** WARNING ** Keyv Redis client does not support Prefix like ioredis above.
  // The prefix feature will be handled by the Keyv-Redis store in cacheFactory.js
  const redisOptions = { username, password, socket: { tls: ca != null, ca } };

  keyvRedisClient =
    urls.length === 1
      ? createClient({ url: cacheConfig.REDIS_URI, ...redisOptions })
      : createCluster({
          rootNodes: cacheConfig.REDIS_URI.split(',').map((url) => ({ url })),
          defaults: redisOptions,
        });

  keyvRedisClient.setMaxListeners(cacheConfig.REDIS_MAX_LISTENERS);

  // Pinging the Redis server every 5 minutes to keep the connection alive
  const keyvPingInterval = setInterval(() => keyvRedisClient.ping(), 5 * 60 * 1000);
  keyvRedisClient.on('disconnect', () => clearInterval(keyvPingInterval));
  keyvRedisClient.on('end', () => clearInterval(keyvPingInterval));
}

module.exports = { ioredisClient, keyvRedisClient, GLOBAL_PREFIX_SEPARATOR };
