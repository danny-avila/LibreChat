const Keyv = require('keyv');
const { logFile, violationFile } = require('./keyvFiles');
const logs = new Keyv({ store: logFile, namespace: 'violations' });
const namespaces = {
  concurrent: new Keyv({ store: violationFile, namespace: 'concurrent' }),
  non_browser: new Keyv({ store: violationFile, namespace: 'non_browser' }),
  message_limit: new Keyv({ store: violationFile, namespace: 'message_limit' }),
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
 * @returns {Object} - If a valid type is passed, returns an object containing the logs for violations of the specified type and the general logs.
 *                     If no type is passed, returns an object containing the general logs.
 * @throws Will throw an error if an invalid violation type is passed.
 */
const getLogStores = (type) => {
  if (!type) {
    return { logs };
  }
  const violationLogs = namespaces[type];
  if (!violationLogs) {
    throw new Error(`Invalid violation type: ${type}`);
  }
  return { violationLogs, logs };
};

module.exports = getLogStores;
