require('dotenv').config();
const { isEnabled, instrumentMongooseQueryMetrics } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI;

instrumentMongooseQueryMetrics(mongoose);

if (!MONGO_URI) {
  throw new Error('Please define the MONGO_URI environment variable');
}

/** Applied when the corresponding env var is unset or not a valid number. */
const DEFAULT_MAX_IDLE_TIME_MS = 60000;
const DEFAULT_HEARTBEAT_FREQUENCY_MS = 10000;

/**
 * Parses an env var as an integer, falling back to `defaultValue` when the
 * value is unset or not a valid number. Unlike `parseInt(value) || fallback`,
 * this respects an explicit `"0"` override instead of treating it as unset.
 * @param {string | undefined} value
 * @param {number} defaultValue
 * @returns {number}
 */
function parseEnvInt(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Builds the mongoose connection options from environment variables. Pure
 * function — performs no I/O, so connection resilience tuning can be unit
 * tested without a running MongoDB instance.
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {import('mongoose').ConnectOptions}
 */
function buildMongoConnectionOptions(env = process.env) {
  /** The maximum number of connections in the connection pool. */
  const maxPoolSize = parseInt(env.MONGO_MAX_POOL_SIZE) || undefined;
  /** The minimum number of connections in the connection pool. */
  const minPoolSize = parseInt(env.MONGO_MIN_POOL_SIZE) || undefined;
  /** The maximum number of connections that may be in the process of being established concurrently by the connection pool. */
  const maxConnecting = parseInt(env.MONGO_MAX_CONNECTING) || undefined;
  /** The maximum time in milliseconds that a thread can wait for a connection to become available. */
  const waitQueueTimeoutMS = parseInt(env.MONGO_WAIT_QUEUE_TIMEOUT_MS) || undefined;
  /** Maximum time a pooled connection may sit idle before being proactively closed, so a network intermediary (LB/NAT/firewall) doesn't silently drop it first. */
  const maxIdleTimeMS = parseEnvInt(env.MONGO_MAX_IDLE_TIME_MS, DEFAULT_MAX_IDLE_TIME_MS);
  /** How often the driver pings each server to detect topology changes, e.g. a replica set election. */
  const heartbeatFrequencyMS = parseEnvInt(
    env.MONGO_HEARTBEAT_FREQUENCY_MS,
    DEFAULT_HEARTBEAT_FREQUENCY_MS,
  );
  /** Set to false to disable automatic index creation for all models associated with this connection. */
  const autoIndex =
    env.MONGO_AUTO_INDEX != undefined ? isEnabled(env.MONGO_AUTO_INDEX) || false : undefined;
  /** Set to `false` to disable Mongoose automatically calling `createCollection()` on every model created on this connection. */
  const autoCreate =
    env.MONGO_AUTO_CREATE != undefined ? isEnabled(env.MONGO_AUTO_CREATE) || false : undefined;

  return {
    bufferCommands: false,
    maxIdleTimeMS,
    heartbeatFrequencyMS,
    ...(maxPoolSize ? { maxPoolSize } : {}),
    ...(minPoolSize ? { minPoolSize } : {}),
    ...(maxConnecting ? { maxConnecting } : {}),
    ...(waitQueueTimeoutMS ? { waitQueueTimeoutMS } : {}),
    ...(autoIndex != undefined ? { autoIndex } : {}),
    ...(autoCreate != undefined ? { autoCreate } : {}),
  };
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

mongoose.connection.on('error', (err) => {
  logger.error('[connectDb] MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('[connectDb] MongoDB connection lost (disconnected)');
});

mongoose.connection.on('reconnected', () => {
  logger.info('[connectDb] MongoDB connection restored (reconnected)');
});

mongoose.connection.on('close', () => {
  logger.info('[connectDb] MongoDB connection closed');
});

async function connectDb() {
  if (cached.conn && cached.conn?.readyState === 1) {
    return cached.conn;
  }

  const disconnected = cached.conn && cached.conn?.readyState !== 1;
  if (!cached.promise || disconnected) {
    const opts = buildMongoConnectionOptions();
    logger.info('Mongo Connection options');
    logger.info(JSON.stringify(opts, null, 2));
    mongoose.set('strictQuery', true);
    cached.promise = mongoose.connect(MONGO_URI, opts).then((mongoose) => {
      return mongoose.connection;
    });
  }
  cached.conn = await cached.promise;

  return cached.conn;
}

module.exports = {
  connectDb,
  buildMongoConnectionOptions,
};
