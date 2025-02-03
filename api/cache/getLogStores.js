const Keyv = require('keyv');
const { CacheKeys, ViolationTypes, Time } = require('librechat-data-provider');
const { logFile, violationFile } = require('./keyvFiles');
const { math, isEnabled } = require('~/server/utils');
const keyvRedis = require('./keyvRedis');
const keyvMongo = require('./keyvMongo');

const { BAN_DURATION, USE_REDIS, DEBUG_MEMORY_CACHE, CI } = process.env ?? {};

const duration = math(BAN_DURATION, 7200000);
const isRedisEnabled = isEnabled(USE_REDIS);
const debugMemoryCache = isEnabled(DEBUG_MEMORY_CACHE);

const createViolationInstance = (namespace) => {
  const config = isRedisEnabled ? { store: keyvRedis } : { store: violationFile, namespace };
  return new Keyv(config);
};

// Serve cache from memory so no need to clear it on startup/exit
const pending_req = isRedisEnabled
  ? new Keyv({ store: keyvRedis })
  : new Keyv({ namespace: 'pending_req' });

const config = isRedisEnabled
  ? new Keyv({ store: keyvRedis })
  : new Keyv({ namespace: CacheKeys.CONFIG_STORE });

const roles = isRedisEnabled
  ? new Keyv({ store: keyvRedis })
  : new Keyv({ namespace: CacheKeys.ROLES });

const nurieModelMapping = isRedisEnabled
  ? new Keyv({ store: keyvRedis, ttl: Time.TEN_MINUTES })
  : new Keyv({ namespace: CacheKeys.NURIEAI_MODEL_MAPPING, ttl: Time.TEN_MINUTES });

const audioRuns = isRedisEnabled
  ? new Keyv({ store: keyvRedis, ttl: Time.TEN_MINUTES })
  : new Keyv({ namespace: CacheKeys.AUDIO_RUNS, ttl: Time.TEN_MINUTES });

const messages = isRedisEnabled
  ? new Keyv({ store: keyvRedis, ttl: Time.ONE_MINUTE })
  : new Keyv({ namespace: CacheKeys.MESSAGES, ttl: Time.ONE_MINUTE });

const tokenConfig = isRedisEnabled
  ? new Keyv({ store: keyvRedis, ttl: Time.THIRTY_MINUTES })
  : new Keyv({ namespace: CacheKeys.TOKEN_CONFIG, ttl: Time.THIRTY_MINUTES });

const genTitle = isRedisEnabled
  ? new Keyv({ store: keyvRedis, ttl: Time.TWO_MINUTES })
  : new Keyv({ namespace: CacheKeys.GEN_TITLE, ttl: Time.TWO_MINUTES });

const modelQueries = isEnabled(process.env.USE_REDIS)
  ? new Keyv({ store: keyvRedis })
  : new Keyv({ namespace: CacheKeys.MODEL_QUERIES });

const abortKeys = isRedisEnabled
  ? new Keyv({ store: keyvRedis })
  : new Keyv({ namespace: CacheKeys.ABORT_KEYS, ttl: Time.TEN_MINUTES });

const namespaces = {
  [CacheKeys.ROLES]: roles,
  [CacheKeys.CONFIG_STORE]: config,
  pending_req,
  [ViolationTypes.BAN]: new Keyv({ store: keyvMongo, namespace: CacheKeys.BANS, ttl: duration }),
  [CacheKeys.ENCODED_DOMAINS]: new Keyv({
    store: keyvMongo,
    namespace: CacheKeys.ENCODED_DOMAINS,
    ttl: 0,
  }),
  general: new Keyv({ store: logFile, namespace: 'violations' }),
  concurrent: createViolationInstance('concurrent'),
  non_browser: createViolationInstance('non_browser'),
  message_limit: createViolationInstance('message_limit'),
  token_balance: createViolationInstance(ViolationTypes.TOKEN_BALANCE),
  registrations: createViolationInstance('registrations'),
  [ViolationTypes.TTS_LIMIT]: createViolationInstance(ViolationTypes.TTS_LIMIT),
  [ViolationTypes.STT_LIMIT]: createViolationInstance(ViolationTypes.STT_LIMIT),
  [ViolationTypes.CONVO_ACCESS]: createViolationInstance(ViolationTypes.CONVO_ACCESS),
  [ViolationTypes.TOOL_CALL_LIMIT]: createViolationInstance(ViolationTypes.TOOL_CALL_LIMIT),
  [ViolationTypes.FILE_UPLOAD_LIMIT]: createViolationInstance(ViolationTypes.FILE_UPLOAD_LIMIT),
  [ViolationTypes.VERIFY_EMAIL_LIMIT]: createViolationInstance(ViolationTypes.VERIFY_EMAIL_LIMIT),
  [ViolationTypes.RESET_PASSWORD_LIMIT]: createViolationInstance(
    ViolationTypes.RESET_PASSWORD_LIMIT,
  ),
  [ViolationTypes.ILLEGAL_MODEL_REQUEST]: createViolationInstance(
    ViolationTypes.ILLEGAL_MODEL_REQUEST,
  ),
  [CacheKeys.NURIEAI_MODEL_MAPPING]: nurieModelMapping,
  logins: createViolationInstance('logins'),
  [CacheKeys.ABORT_KEYS]: abortKeys,
  [CacheKeys.TOKEN_CONFIG]: tokenConfig,
  [CacheKeys.GEN_TITLE]: genTitle,
  [CacheKeys.MODEL_QUERIES]: modelQueries,
  [CacheKeys.AUDIO_RUNS]: audioRuns,
  [CacheKeys.MESSAGES]: messages,
};

/**
 * Gets all cache stores that have TTL configured
 * @returns {Keyv[]}
 */
function getTTLStores() {
  return Object.values(namespaces).filter(
    (store) => store instanceof Keyv && typeof store.opts?.ttl === 'number' && store.opts.ttl > 0,
  );
}

/**
 * Clears entries older than the cache's TTL
 * @param {Keyv} cache
 */
async function clearExpiredFromCache(cache) {
  if (!cache?.opts?.store?.entries) {
    return;
  }

  const ttl = cache.opts.ttl;
  if (!ttl) {
    return;
  }

  const expiryTime = Date.now() - ttl;
  let cleared = 0;

  // Get all keys first to avoid modification during iteration
  const keys = Array.from(cache.opts.store.keys());

  for (const key of keys) {
    try {
      const raw = cache.opts.store.get(key);
      if (!raw) {
        continue;
      }

      const data = cache.opts.deserialize(raw);
      // Check if the entry is older than TTL
      if (data?.expires && data.expires <= expiryTime) {
        const deleted = await cache.opts.store.delete(key);
        if (!deleted) {
          debugMemoryCache &&
            console.warn(`[Cache] Error deleting entry: ${key} from ${cache.opts.namespace}`);
          continue;
        }
        cleared++;
      }
    } catch (error) {
      debugMemoryCache &&
        console.log(`[Cache] Error processing entry from ${cache.opts.namespace}:`, error);
      const deleted = await cache.opts.store.delete(key);
      if (!deleted) {
        debugMemoryCache &&
          console.warn(`[Cache] Error deleting entry: ${key} from ${cache.opts.namespace}`);
        continue;
      }
      cleared++;
    }
  }

  if (cleared > 0) {
    debugMemoryCache &&
      console.log(
        `[Cache] Cleared ${cleared} entries older than ${ttl}ms from ${cache.opts.namespace}`,
      );
  }
}

const auditCache = () => {
  const ttlStores = getTTLStores();
  console.log('[Cache] Starting audit');

  ttlStores.forEach((store) => {
    if (!store?.opts?.store?.entries) {
      return;
    }

    console.log(`[Cache] ${store.opts.namespace} entries:`, {
      count: store.opts.store.size,
      ttl: store.opts.ttl,
      keys: Array.from(store.opts.store.keys()),
      entriesWithTimestamps: Array.from(store.opts.store.entries()).map(([key, value]) => ({
        key,
        value,
      })),
    });
  });
};

/**
 * Clears expired entries from all TTL-enabled stores
 */
async function clearAllExpiredFromCache() {
  const ttlStores = getTTLStores();
  await Promise.all(ttlStores.map((store) => clearExpiredFromCache(store)));

  // Force garbage collection if available (Node.js with --expose-gc flag)
  if (global.gc) {
    global.gc();
  }
}

if (!isRedisEnabled && !isEnabled(CI)) {
  /** @type {Set<NodeJS.Timeout>} */
  const cleanupIntervals = new Set();

  // Clear expired entries every 30 seconds
  const cleanup = setInterval(() => {
    clearAllExpiredFromCache();
  }, Time.THIRTY_SECONDS);

  cleanupIntervals.add(cleanup);

  if (debugMemoryCache) {
    const monitor = setInterval(() => {
      const ttlStores = getTTLStores();
      const memory = process.memoryUsage();
      const totalSize = ttlStores.reduce((sum, store) => sum + (store.opts?.store?.size ?? 0), 0);

      console.log('[Cache] Memory usage:', {
        heapUsed: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        rss: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memory.external / 1024 / 1024).toFixed(2)} MB`,
        totalCacheEntries: totalSize,
      });

      auditCache();
    }, Time.ONE_MINUTE);

    cleanupIntervals.add(monitor);
  }

  const dispose = () => {
    debugMemoryCache && console.log('[Cache] Cleaning up and shutting down...');
    cleanupIntervals.forEach((interval) => clearInterval(interval));
    cleanupIntervals.clear();

    // One final cleanup before exit
    clearAllExpiredFromCache().then(() => {
      debugMemoryCache && console.log('[Cache] Final cleanup completed');
      process.exit(0);
    });
  };

  // Handle various termination signals
  process.on('SIGTERM', dispose);
  process.on('SIGINT', dispose);
  process.on('SIGQUIT', dispose);
  process.on('SIGHUP', dispose);
}

/**
 * Returns the keyv cache specified by type.
 * If an invalid type is passed, an error will be thrown.
 *
 * @param {string} key - The key for the namespace to access
 * @returns {Keyv} - If a valid key is passed, returns an object containing the cache store of the specified key.
 * @throws Will throw an error if an invalid key is passed.
 */
const getLogStores = (key) => {
  if (!key || !namespaces[key]) {
    throw new Error(`Invalid store key: ${key}`);
  }
  return namespaces[key];
};

module.exports = getLogStores;
