const IoRedis = require('ioredis');
const IoValkey = require('iovalkey');
const { logger } = require('@librechat/data-schemas');
const { createClient, createCluster } = require('@keyv/redis');
const { cacheConfig } = require('./cacheConfig');

const GLOBAL_PREFIX_SEPARATOR = '::';

const urls = cacheConfig.REDIS_URI?.split(',').map((uri) => new URL(uri));
const username = urls?.[0].username || cacheConfig.REDIS_USERNAME;
const password = urls?.[0].password || cacheConfig.REDIS_PASSWORD;
const ca = cacheConfig.REDIS_CA;

/** @type {import('ioredis').Redis | import('iovalkey').Cluster | null} */
let ioredisClient = null;
if (cacheConfig.USE_REDIS) {
  /** @type {import('ioredis').RedisOptions | import('iovalkey').ClusterOptions} */
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
      const targetErrors = ['READONLY', 'MOVED'];
      if (targetErrors.some(error => err.message.includes(error))) {
        if (err.message.includes('MOVED')) {
          logger.warn('ioredis reconnecting due to MOVED error - cluster slot redirection');
        } else if (err.message.includes('READONLY')) {
          logger.warn('ioredis reconnecting due to READONLY error');
        }
        return true;
      }
      return false;
    },
    enableOfflineQueue: cacheConfig.REDIS_ENABLE_OFFLINE_QUEUE,
    connectTimeout: cacheConfig.REDIS_CONNECT_TIMEOUT,
    maxRetriesPerRequest: 3,
  };

  // Use iovalkey for cluster, ioredis for single instance
  if (urls.length === 1) {
    ioredisClient = new IoRedis(cacheConfig.REDIS_URI, redisOptions);
  } else {
    // Use iovalkey for cluster instead of ioredis cluster
    const valkeyOptions = {
      username,
      password,
      tls: ca ? { ca } : undefined,
      keyPrefix: `${cacheConfig.REDIS_KEY_PREFIX}${GLOBAL_PREFIX_SEPARATOR}`,
      maxListeners: cacheConfig.REDIS_MAX_LISTENERS,
      retryStrategy: (times) => {
        if (
          cacheConfig.REDIS_RETRY_MAX_ATTEMPTS > 0 &&
          times > cacheConfig.REDIS_RETRY_MAX_ATTEMPTS
        ) {
          logger.error(
            `iovalkey cluster giving up after ${cacheConfig.REDIS_RETRY_MAX_ATTEMPTS} reconnection attempts`,
          );
          return null;
        }
        const delay = Math.min(times * 100, cacheConfig.REDIS_RETRY_MAX_DELAY);
        logger.info(`iovalkey cluster reconnecting... attempt ${times}, delay ${delay}ms`);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetErrors = ['READONLY', 'MOVED'];
        if (targetErrors.some(error => err.message.includes(error))) {
          if (err.message.includes('MOVED')) {
            logger.warn('iovalkey reconnecting due to MOVED error - cluster slot redirection');
          } else if (err.message.includes('READONLY')) {
            logger.warn('iovalkey reconnecting due to READONLY error');
          }
          return true;
        }
        return false;
      },
      enableOfflineQueue: cacheConfig.REDIS_ENABLE_OFFLINE_QUEUE,
      connectTimeout: cacheConfig.REDIS_CONNECT_TIMEOUT,
      maxRetriesPerRequest: 3,
    };

    ioredisClient = new IoValkey.Cluster(cacheConfig.REDIS_URI.split(','), {
      redisOptions: valkeyOptions,
      enableReadyCheck: true,
      maxRedirections: 16,
      clusterRetryStrategy: (times) => {
        if (
          cacheConfig.REDIS_RETRY_MAX_ATTEMPTS > 0 &&
          times > cacheConfig.REDIS_RETRY_MAX_ATTEMPTS
        ) {
          logger.error(
            `iovalkey cluster giving up after ${cacheConfig.REDIS_RETRY_MAX_ATTEMPTS} reconnection attempts`,
          );
          return null;
        }
        const delay = Math.min(times * 100, cacheConfig.REDIS_RETRY_MAX_DELAY);
        logger.info(`iovalkey cluster reconnecting... attempt ${times}, delay ${delay}ms`);
        return delay;
      },
      enableOfflineQueue: cacheConfig.REDIS_ENABLE_OFFLINE_QUEUE,
    });
  }

  ioredisClient.on('error', (err) => {
    if (err.message && err.message.includes('MOVED')) {
      logger.warn('Redis cluster slot moved, client will follow redirection:', err.message);
    } else {
      logger.error('Redis client error:', err);
    }
  });

  ioredisClient.on('connect', () => {
    logger.info('Redis client connected');
  });

  ioredisClient.on('ready', () => {
    logger.info('Redis client ready');
  });

  ioredisClient.on('reconnecting', (delay) => {
    // Handle both ioredis and iovalkey events
    if (typeof delay === 'number') {
      logger.info(`Redis client reconnecting in ${delay}ms`);
    } else {
      logger.info('Redis client reconnecting...');
    }
  });

  ioredisClient.on('close', () => {
    logger.warn('Redis client connection closed');
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
          logger.error('Redis ping failed:', err);
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
    urls.length === 1
      ? createClient({ url: cacheConfig.REDIS_URI, ...redisOptions })
      : createCluster({
        rootNodes: cacheConfig.REDIS_URI.split(',').map((url) => ({ url })),
        defaults: redisOptions,
        useReplicas: true,
        maxRedirections: 16,
      });

  keyvRedisClient.setMaxListeners(cacheConfig.REDIS_MAX_LISTENERS);

  keyvRedisClient.on('error', (err) => {
    if (err.message && err.message.includes('MOVED')) {
      logger.warn('@keyv/redis cluster slot moved, client will follow redirection:', err.message);
    } else {
      logger.error('@keyv/redis client error:', err);
    }
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
