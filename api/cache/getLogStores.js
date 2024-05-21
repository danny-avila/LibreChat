const Keyv = require('keyv');
const { CacheKeys, ViolationTypes } = require('librechat-data-provider');
const { logFile, violationFile } = require('./keyvFiles');
const { math, isEnabled } = require('~/server/utils');
const keyvRedis = require('./keyvRedis');
const keyvMongo = require('./keyvMongo');

const { BAN_DURATION, USE_REDIS } = process.env ?? {};
const THIRTY_MINUTES = 1800000;

const duration = math(BAN_DURATION, 7200000);

const createViolationInstance = (namespace) => {
  const config = isEnabled(USE_REDIS) ? { store: keyvRedis } : { store: violationFile, namespace };
  return new Keyv(config);
};

// Serve cache from memory so no need to clear it on startup/exit
const pending_req = isEnabled(USE_REDIS)
  ? new Keyv({ store: keyvRedis })
  : new Keyv({ namespace: 'pending_req' });

const config = isEnabled(USE_REDIS)
  ? new Keyv({ store: keyvRedis })
  : new Keyv({ namespace: CacheKeys.CONFIG_STORE });

const tokenConfig = isEnabled(USE_REDIS) // ttl: 30 minutes
  ? new Keyv({ store: keyvRedis, ttl: THIRTY_MINUTES })
  : new Keyv({ namespace: CacheKeys.TOKEN_CONFIG, ttl: THIRTY_MINUTES });

const genTitle = isEnabled(USE_REDIS) // ttl: 2 minutes
  ? new Keyv({ store: keyvRedis, ttl: 120000 })
  : new Keyv({ namespace: CacheKeys.GEN_TITLE, ttl: 120000 });

const modelQueries = isEnabled(process.env.USE_REDIS)
  ? new Keyv({ store: keyvRedis })
  : new Keyv({ namespace: CacheKeys.MODEL_QUERIES });

const abortKeys = isEnabled(USE_REDIS)
  ? new Keyv({ store: keyvRedis })
  : new Keyv({ namespace: CacheKeys.ABORT_KEYS, ttl: 600000 });

const namespaces = {
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
  [ViolationTypes.FILE_UPLOAD_LIMIT]: createViolationInstance(ViolationTypes.FILE_UPLOAD_LIMIT),
  [ViolationTypes.ILLEGAL_MODEL_REQUEST]: createViolationInstance(
    ViolationTypes.ILLEGAL_MODEL_REQUEST,
  ),
  logins: createViolationInstance('logins'),
  [CacheKeys.ABORT_KEYS]: abortKeys,
  [CacheKeys.TOKEN_CONFIG]: tokenConfig,
  [CacheKeys.GEN_TITLE]: genTitle,
  [CacheKeys.MODEL_QUERIES]: modelQueries,
};

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
