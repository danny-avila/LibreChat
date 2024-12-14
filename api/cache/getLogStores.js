const Keyv = require('keyv');
const { CacheKeys, ViolationTypes, Time } = require('librechat-data-provider');
const { logFile, violationFile } = require('./keyvFiles');
const { math, isEnabled } = require('~/server/utils');
const keyvRedis = require('./keyvRedis');
const keyvMongo = require('./keyvMongo');

const { BAN_DURATION, USE_REDIS } = process.env ?? {};

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

const roles = isEnabled(USE_REDIS)
  ? new Keyv({ store: keyvRedis })
  : new Keyv({ namespace: CacheKeys.ROLES });

const audioRuns = isEnabled(USE_REDIS)
  ? new Keyv({ store: keyvRedis, ttl: Time.TEN_MINUTES })
  : new Keyv({ namespace: CacheKeys.AUDIO_RUNS, ttl: Time.TEN_MINUTES });

const messages = isEnabled(USE_REDIS)
  ? new Keyv({ store: keyvRedis, ttl: Time.FIVE_MINUTES })
  : new Keyv({ namespace: CacheKeys.MESSAGES, ttl: Time.FIVE_MINUTES });

const tokenConfig = isEnabled(USE_REDIS)
  ? new Keyv({ store: keyvRedis, ttl: Time.THIRTY_MINUTES })
  : new Keyv({ namespace: CacheKeys.TOKEN_CONFIG, ttl: Time.THIRTY_MINUTES });

const genTitle = isEnabled(USE_REDIS)
  ? new Keyv({ store: keyvRedis, ttl: Time.TWO_MINUTES })
  : new Keyv({ namespace: CacheKeys.GEN_TITLE, ttl: Time.TWO_MINUTES });

const modelQueries = isEnabled(process.env.USE_REDIS)
  ? new Keyv({ store: keyvRedis })
  : new Keyv({ namespace: CacheKeys.MODEL_QUERIES });

const abortKeys = isEnabled(USE_REDIS)
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
  [ViolationTypes.MODERATION]: createViolationInstance(ViolationTypes.MODERATION),
  logins: createViolationInstance('logins'),
  [CacheKeys.ABORT_KEYS]: abortKeys,
  [CacheKeys.TOKEN_CONFIG]: tokenConfig,
  [CacheKeys.GEN_TITLE]: genTitle,
  [CacheKeys.MODEL_QUERIES]: modelQueries,
  [CacheKeys.AUDIO_RUNS]: audioRuns,
  [CacheKeys.MESSAGES]: messages,
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
