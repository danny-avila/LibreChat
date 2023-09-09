const getLogStores = require('./getLogStores');

/**
 * Logs the violation.
 *
 * @param {Object} req - Express request object containing user information.
 * @param {string} type - The type of violation.
 * @param {Object} errorMessage - The error message to log.
 */
const logViolation = async (req, type, errorMessage) => {
  const userId = req.user.id;
  const { violationLogs, logs } = getLogStores(type);
  const userViolations = (await violationLogs.get(userId)) ?? 0;
  await violationLogs.set(userId, userViolations + 1);
  errorMessage.violationCount = userViolations + 1;
  errorMessage.date = new Date().toISOString();
  errorMessage.ip = req.ip;
  const userLogs = (await logs.get(userId)) ?? [];
  userLogs.push(errorMessage);
  await logs.set(userId, userLogs);
};

module.exports = logViolation;
