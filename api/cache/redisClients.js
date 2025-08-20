const IoRedis = require('ioredis');
const { logger } = require('@librechat/data-schemas');
const { createClient, createCluster } = require('@keyv/redis');
const { cacheConfig } = require('./cacheConfig');

const GLOBAL_PREFIX_SEPARATOR = '::';

const urls = cacheConfig.REDIS_URI?.split(',').map((uri) => new URL(uri));
const username = urls?.[0].username || cacheConfig.REDIS_USERNAME;
const password = urls?.[0].password || cacheConfig.REDIS_PASSWORD;
const ca = cacheConfig.REDIS_CA;

/** @type {import('ioredis').Redis | import('ioredis').Cluster | null} */
let ioredisClient = null;
if (cacheConfig.USE_REDIS) {
  /** @type {import('ioredis').RedisOptions | import('ioredis').ClusterOptions} */
  const redisOptions = {
    username: username,
    password: password,
    tls: ca ? { ca } : undefined,
    keyPrefix: `${cacheConfig.REDIS_KEY_PREFIX}${GLOBAL_PREFIX_SEPARATOR}`,
    maxListeners: cacheConfig.REDIS_MAX_LISTENERS,
    retryStrategy: (times) => {
      if (
        cacheConfig.REDIS_RETRY_MAX_ATTEMPTS > 0 &&
        times > cacheConfig.REDIS_RETRY_MAX_ATTEMPTS
      ) {
        logger.error(
          `ioredis giving up after ${cacheConfig.REDIS_RETRY_MAX_ATTEMPTS} reconnection attempts`,
        );
        return null;
      }
      const delay = Math.min(times * 50, cacheConfig.REDIS_RETRY_MAX_DELAY);
      logger.info(`ioredis reconnecting... attempt ${times}, delay ${delay}ms`);
      return delay;
    },
    reconnectOnError: (err) => {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        logger.warn('ioredis reconnecting due to READONLY error');
        return 2; // Return retry delay instead of boolean
      }
      return false;
    },
    enableOfflineQueue: cacheConfig.REDIS_ENABLE_OFFLINE_QUEUE,
    connectTimeout: cacheConfig.REDIS_CONNECT_TIMEOUT,
    maxRetriesPerRequest: 3,
  };

  ioredisClient =
    urls.length === 1 && !cacheConfig.USE_REDIS_CLUSTER
      ? new IoRedis(cacheConfig.REDIS_URI, redisOptions)
      : new IoRedis.Cluster(
          urls.map((url) => ({ host: url.hostname, port: parseInt(url.port, 10) || 6379 })),
          {
            redisOptions,
            clusterRetryStrategy: (times) => {
              if (
                cacheConfig.REDIS_RETRY_MAX_ATTEMPTS > 0 &&
                times > cacheConfig.REDIS_RETRY_MAX_ATTEMPTS
              ) {
                logger.error(
                  `ioredis cluster giving up after ${cacheConfig.REDIS_RETRY_MAX_ATTEMPTS} reconnection attempts`,
                );
                return null;
              }
              const delay = Math.min(times * 100, cacheConfig.REDIS_RETRY_MAX_DELAY);
              logger.info(`ioredis cluster reconnecting... attempt ${times}, delay ${delay}ms`);
              return delay;
            },
            enableOfflineQueue: cacheConfig.REDIS_ENABLE_OFFLINE_QUEUE,
          },
        );

  ioredisClient.on('error', (err) => {
    logger.error('ioredis client error:', err);
  });

  ioredisClient.on('connect', () => {
    logger.info('ioredis client connected');
  });

  ioredisClient.on('ready', () => {
    logger.info('ioredis client ready');
  });

  ioredisClient.on('reconnecting', (delay) => {
    logger.info(`ioredis client reconnecting in ${delay}ms`);
  });

  ioredisClient.on('close', () => {
    logger.warn('ioredis client connection closed');
  });

  /** Ping Interval to keep the Redis server connection alive (if enabled) */
  let pingInterval = null;
  const clearPingInterval = () => {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  };

  if (cacheConfig.REDIS_PING_INTERVAL > 0) {
    pingInterval = setInterval(() => {
      if (ioredisClient && ioredisClient.status === 'ready') {
        ioredisClient.ping().catch((err) => {
          logger.error('ioredis ping failed:', err);
        });
      }
    }, cacheConfig.REDIS_PING_INTERVAL * 1000);
    ioredisClient.on('close', clearPingInterval);
    ioredisClient.on('end', clearPingInterval);
  }
}

/** @type {import('@keyv/redis').RedisClient | import('@keyv/redis').RedisCluster | null} */
let keyvRedisClient = null;
if (cacheConfig.USE_REDIS) {
  /**
   * ** WARNING ** Keyv Redis client does not support Prefix like ioredis above.
   * The prefix feature will be handled by the Keyv-Redis store in cacheFactory.js
   * @type {import('@keyv/redis').RedisClientOptions | import('@keyv/redis').RedisClusterOptions}
   */
  const redisOptions = {
    username,
    password,
    socket: {
      tls: ca != null,
      ca,
      connectTimeout: cacheConfig.REDIS_CONNECT_TIMEOUT,
      reconnectStrategy: (retries) => {
        if (
          cacheConfig.REDIS_RETRY_MAX_ATTEMPTS > 0 &&
          retries > cacheConfig.REDIS_RETRY_MAX_ATTEMPTS
        ) {
          logger.error(
            `@keyv/redis client giving up after ${cacheConfig.REDIS_RETRY_MAX_ATTEMPTS} reconnection attempts`,
          );
          return new Error('Max reconnection attempts reached');
        }
        const delay = Math.min(retries * 100, cacheConfig.REDIS_RETRY_MAX_DELAY);
        logger.info(`@keyv/redis reconnecting... attempt ${retries}, delay ${delay}ms`);
        return delay;
      },
    },
    disableOfflineQueue: !cacheConfig.REDIS_ENABLE_OFFLINE_QUEUE,
  };

  keyvRedisClient =
    urls.length === 1 && !cacheConfig.USE_REDIS_CLUSTER
      ? createClient({ url: cacheConfig.REDIS_URI, ...redisOptions })
      : createCluster({
          rootNodes: urls.map((url) => ({ url: url.href })),
          defaults: redisOptions,
        });

  keyvRedisClient.setMaxListeners(cacheConfig.REDIS_MAX_LISTENERS);

  keyvRedisClient.on('error', (err) => {
    logger.error('@keyv/redis client error:', err);
  });

  keyvRedisClient.on('connect', () => {
    logger.info('@keyv/redis client connected');
  });

  keyvRedisClient.on('ready', () => {
    logger.info('@keyv/redis client ready');
  });

  keyvRedisClient.on('reconnecting', () => {
    logger.info('@keyv/redis client reconnecting...');
  });

  keyvRedisClient.on('disconnect', () => {
    logger.warn('@keyv/redis client disconnected');
  });

  keyvRedisClient.connect().catch((err) => {
    logger.error('@keyv/redis initial connection failed:', err);
    throw err;
  });

  /** Ping Interval to keep the Redis server connection alive (if enabled) */
  let pingInterval = null;
  const clearPingInterval = () => {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  };

  if (cacheConfig.REDIS_PING_INTERVAL > 0) {
    pingInterval = setInterval(() => {
      if (keyvRedisClient && keyvRedisClient.isReady) {
        keyvRedisClient.ping().catch((err) => {
          logger.error('@keyv/redis ping failed:', err);
        });
      }
    }, cacheConfig.REDIS_PING_INTERVAL * 1000);
    keyvRedisClient.on('disconnect', clearPingInterval);
    keyvRedisClient.on('end', clearPingInterval);
  }
}

module.exports = { ioredisClient, keyvRedisClient, GLOBAL_PREFIX_SEPARATOR };
