const Keyv = require('keyv');
const keyvMongo = require('./keyvMongo');
const keyvRedis = require('./keyvRedis');
const { math, isEnabled } = require('../server/utils');
const { logFile, violationFile } = require('./keyvFiles');
const { BAN_DURATION } = process.env ?? {};

const duration = math(BAN_DURATION, 7200000);

const createViolationInstance = (namespace) => {
  const config = isEnabled(process.env.USE_REDIS)
    ? { store: keyvRedis }
    : { store: violationFile, namespace };
  return new Keyv(config);
};

const namespaces = {
  ban: new Keyv({ store: keyvMongo, namespace: 'bans', duration }),
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
