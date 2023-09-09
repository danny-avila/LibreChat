const getLogStores = require('./getLogStores');

/**
 * Logs the violation.
 *
 * @param {string} type - The type of violation.
 * @param {string} userId - The user ID.
 * @param {Object} errorMessage - The error message to log.
 */
const logViolation = async (type, userId, errorMessage) => {
  const { violationLogs, logs } = getLogStores(type);
  const userViolations = (await violationLogs.get(userId)) ?? 0;
  await violationLogs.set(userId, userViolations + 1);
  errorMessage.violationCount = userViolations + 1;
  await logs.set(`${userId}-${new Date().toISOString()}`, errorMessage);
};

module.exports = logViolation;
