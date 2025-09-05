require('dotenv').config();
const { isEnabled } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

const mongoose = require('mongoose');
let MONGO_URI = process.env.MONGO_URI;
let memoryServer = null;

async function resolveMongoUri() {
  if (MONGO_URI) {
    return MONGO_URI;
  }

  // Only allow in-memory DB if explicitly enabled
  if (!isEnabled(process.env.ALLOW_IN_MEMORY_DB)) {
    throw new Error('Please define the MONGO_URI environment variable');
  }

  try {
    // Lazy-require to avoid bundling when not used
    const { MongoMemoryServer } = require('mongodb-memory-server');
    if (!memoryServer) {
      memoryServer = await MongoMemoryServer.create();
      const shutdown = async () => {
        try {
          await memoryServer.stop();
        } catch (e) {
          /* noop */
        }
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      process.on('beforeExit', shutdown);
      process.on('exit', shutdown);
    }
    const uri = memoryServer.getUri();
    logger.warn('[DB] MONGO_URI not set. Using in-memory MongoDB instance for this session.');
    logger.warn('[DB] Data will NOT persist after the container stops.');
    MONGO_URI = uri;
    // Expose for any consumers that read from env after startup
    process.env.MONGO_URI = uri;
    return uri;
  } catch (err) {
    logger.error('[DB] Failed to start in-memory MongoDB. Set MONGO_URI to use an external database.');
    throw err;
  }
}
/** The maximum number of connections in the connection pool. */
const maxPoolSize = parseInt(process.env.MONGO_MAX_POOL_SIZE) || undefined;
/** The minimum number of connections in the connection pool. */
const minPoolSize = parseInt(process.env.MONGO_MIN_POOL_SIZE) || undefined;
/** The maximum number of connections that may be in the process of being established concurrently by the connection pool. */
const maxConnecting = parseInt(process.env.MONGO_MAX_CONNECTING) || undefined;
/** The maximum number of milliseconds that a connection can remain idle in the pool before being removed and closed. */
const maxIdleTimeMS = parseInt(process.env.MONGO_MAX_IDLE_TIME_MS) || undefined;
/** The maximum time in milliseconds that a thread can wait for a connection to become available. */
const waitQueueTimeoutMS = parseInt(process.env.MONGO_WAIT_QUEUE_TIMEOUT_MS) || undefined;
/** Set to false to disable automatic index creation for all models associated with this connection. */
const autoIndex =
  process.env.MONGO_AUTO_INDEX != undefined
    ? isEnabled(process.env.MONGO_AUTO_INDEX) || false
    : undefined;

/** Set to `false` to disable Mongoose automatically calling `createCollection()` on every model created on this connection. */
const autoCreate =
  process.env.MONGO_AUTO_CREATE != undefined
    ? isEnabled(process.env.MONGO_AUTO_CREATE) || false
    : undefined;
/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDb() {
  if (cached.conn && cached.conn?._readyState === 1) {
    return cached.conn;
  }

  const disconnected = cached.conn && cached.conn?._readyState !== 1;
  if (!cached.promise || disconnected) {
    const opts = {
      bufferCommands: false,
      ...(maxPoolSize ? { maxPoolSize } : {}),
      ...(minPoolSize ? { minPoolSize } : {}),
      ...(maxConnecting ? { maxConnecting } : {}),
      ...(maxIdleTimeMS ? { maxIdleTimeMS } : {}),
      ...(waitQueueTimeoutMS ? { waitQueueTimeoutMS } : {}),
      ...(autoIndex != undefined ? { autoIndex } : {}),
      ...(autoCreate != undefined ? { autoCreate } : {}),
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
      // bufferMaxEntries: 0,
      // useFindAndModify: true,
      // useCreateIndex: true
    };
    logger.info('Mongo Connection options');
    logger.info(JSON.stringify(opts, null, 2));
    mongoose.set('strictQuery', true);
    cached.promise = resolveMongoUri().then((uri) => mongoose.connect(uri, opts)).then((mongoose) => {
      return mongoose;
    });
  }
  cached.conn = await cached.promise;

  return cached.conn;
}

module.exports = {
  connectDb,
};
