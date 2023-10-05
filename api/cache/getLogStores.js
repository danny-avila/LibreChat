const Keyv = require('keyv');
const keyvMongo = require('./keyvMongo');
const { math } = require('../server/utils');
const { logFile, violationFile } = require('./keyvFiles');
const { BAN_DURATION } = process.env ?? {};

const duration = math(BAN_DURATION, 7200000);

const namespaces = {
  ban: new Keyv({ store: keyvMongo, ttl: duration, namespace: 'bans' }),
  general: new Keyv({ store: logFile, namespace: 'violations' }),
  concurrent: new Keyv({ store: violationFile, namespace: 'concurrent' }),
  non_browser: new Keyv({ store: violationFile, namespace: 'non_browser' }),
  message_limit: new Keyv({ store: violationFile, namespace: 'message_limit' }),
  token_balance: new Keyv({ store: violationFile, namespace: 'token_balance' }),
  registrations: new Keyv({ store: violationFile, namespace: 'registrations' }),
  logins: new Keyv({ store: violationFile, namespace: 'logins' }),
};

/**
 * Returns either the logs of violations specified by type if a type is provided
 * or it returns the general log if no type is specified. If an invalid type is passed,
 * an error will be thrown.
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
  if (!type) {
    throw new Error(`Invalid store type: ${type}`);
  }
  const logs = namespaces[type];
  return logs;
};

module.exports = getLogStores;
