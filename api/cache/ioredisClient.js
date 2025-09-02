const fs = require('fs');
const Redis = require('ioredis');
const { isEnabled } = require('~/server/utils');
const logger = require('~/config/winston');

const { REDIS_URI, USE_REDIS, USE_REDIS_CLUSTER, REDIS_CA, REDIS_MAX_LISTENERS } = process.env;

/** @type {import('ioredis').Redis | import('ioredis').Cluster} */
let ioredisClient;
const redis_max_listeners = Number(REDIS_MAX_LISTENERS) || 40;

function mapURI(uri) {
  const regex =
    /^(?:(?<scheme>\w+):\/\/)?(?:(?<user>[^:@]+)(?::(?<password>[^@]+))?@)?(?<host>[\w.-]+)(?::(?<port>\d{1,5}))?$/;
  const match = uri.match(regex);

  if (match) {
    const { scheme, user, password, host, port } = match.groups;

    return {
      scheme: scheme || 'none',
      user: user || null,
      password: password || null,
      host: host || null,
      port: port || null,
    };
  } else {
    const parts = uri.split(':');
    if (parts.length === 2) {
      return {
        scheme: 'none',
        user: null,
        password: null,
        host: parts[0],
        port: parts[1],
      };
    }

    return {
      scheme: 'none',
      user: null,
      password: null,
      host: uri,
      port: null,
    };
  }
}

if (REDIS_URI && isEnabled(USE_REDIS)) {
  const redisOptions = {
    // Enable auto-reconnection
    retryStrategy: (times) => {
      const delay = Math.min(times * 100, 5000); // Max 5 seconds delay
      logger.warn(`[Redis] Reconnecting in ${delay}ms...`);
      return delay;
    },
    // Reconnect on error
    reconnectOnError: (err) => {
      logger.error('[Redis] Reconnect on error:', err.message);
      return true; // Reconnect on any error
    },
    // Enable keep-alive
    keepAlive: 10000, // 10 seconds
    // Connection timeout
    connectTimeout: 10000, // 10 seconds
    // Max retries per request
    maxRetriesPerRequest: 3,
    // Enable offline queue
    enableOfflineQueue: true,
    // Auto-resend unfulfilled commands
    autoResendUnfulfilledCommands: true,
  };

  try {
    if (isEnabled(USE_REDIS_CLUSTER)) {
      // Cluster configuration
      const nodes = REDIS_URI.split(',').map(uri => {
        const { host, port } = mapURI(uri.trim());
        return { host, port: parseInt(port) };
      });
      
      ioredisClient = new Redis.Cluster(nodes, {
        ...redisOptions,
        scaleReads: 'slave',
        redisOptions: {
          ...redisOptions,
          password: mapURI(REDIS_URI).password,
          tls: REDIS_CA ? { ca: [fs.readFileSync(REDIS_CA)] } : undefined,
        },
      });
    } else {
      // Single instance configuration
      const { host, port, password } = mapURI(REDIS_URI);
      ioredisClient = new Redis({
        ...redisOptions,
        host,
        port: parseInt(port),
        password,
        tls: REDIS_CA ? { ca: [fs.readFileSync(REDIS_CA)] } : undefined,
      });
    }

    // Event listeners
    ioredisClient.on('connect', () => {
      logger.info('[Redis] Connected to Redis server');
    });

    ioredisClient.on('ready', () => {
      logger.info('[Redis] Redis client is ready');
    });

    ioredisClient.on('error', (err) => {
      logger.error('[Redis] Error:', err);
    });

    ioredisClient.on('reconnecting', () => {
      logger.warn('[Redis] Reconnecting to Redis...');
    });

    // Set max listeners
    ioredisClient.setMaxListeners(redis_max_listeners);
    logger.info('[Optional] Redis initialized. If you have issues, or seeing older values, disable it or flush cache to refresh values.');
  } catch (error) {
    logger.error('[Redis] Failed to initialize Redis client:', error);
    // Don't crash the app if Redis fails to initialize
    ioredisClient = null;
  }
} else {
  logger.info('[Optional] IoRedis not initialized for rate limiters.');
}

// Initialize health check
if (ioredisClient) {
  // Import and start health check
  const redisHealth = require('./redisHealth');
  
  // Add error handler for unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    if (reason.message && reason.message.includes('ETIMEDOUT')) {
      logger.warn('[Redis] Unhandled timeout, attempting to reconnect...');
      ioredisClient.disconnect();
      ioredisClient.connect().catch(err => {
        logger.error('[Redis] Reconnection attempt failed:', err.message);
      });
    }
  });

  // Graceful shutdown
  const shutdown = async () => {
    try {
      logger.info('[Redis] Closing connection...');
      await ioredisClient.quit();
      logger.info('[Redis] Connection closed');
      process.exit(0);
    } catch (error) {
      logger.error('[Redis] Error during shutdown:', error);
      process.exit(1);
    }
  };

  // Handle process termination
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = ioredisClient;
