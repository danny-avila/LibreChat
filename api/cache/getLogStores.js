const Keyv = require('keyv');
const keyvMongo = require('./keyvMongo');
const keyvRedis = require('./keyvRedis');
const { math, isEnabled } = require('../server/utils');
const { logFile, violationFile } = require('./keyvFiles');
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

const namespaces = {
  pending_req,
  ban: new Keyv({ store: keyvMongo, namespace: 'bans', ttl: duration }),
  general: new Keyv({ store: logFile, namespace: 'violations' }),
  concurrent: createViolationInstance('concurrent'),
  non_browser: createViolationInstance('non_browser'),
  message_limit: createViolationInstance('message_limit'),
  token_balance: createViolationInstance('token_balance'),
  registrations: createViolationInstance('registrations'),
  logins: createViolationInstance('logins'),
};

/**
 * Returns the keyv cache specified by type.
 * If an invalid type is passed, an error will be thrown.
 *
 * @module getLogStores
 * @requires keyv - a simple key-value storage that allows you to easily switch out storage adapters.
 * @requires keyvFiles - a module that includes the logFile and violationFile.
 *
 * @param {string} type - The type of violation, which can be 'concurrent', 'message_limit', 'registrations' or 'logins'.
 * @returns {Keyv} - If a valid type is passed, returns an object containing the logs for violations of the specified type.
 * @throws Will throw an error if an invalid violation type is passed.
 */
const getLogStores = (type) => {
  if (!type || !namespaces[type]) {
    throw new Error(`Invalid store type: ${type}`);
  }
  return namespaces[type];
};

module.exports = getLogStores;
