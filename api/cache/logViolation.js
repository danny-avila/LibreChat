const getLogStores = require('./getLogStores');

/**
 * Logs the violation.
 *
 * @param {Object} req - Express request object containing user information.
 * @param {string} type - The type of violation.
 * @param {Object} errorMessage - The error message to log.
 * @param {number} [score=1] - The severity of the violation. Defaults to 1
 */
const logViolation = async (req, type, errorMessage, score = 1) => {
  const userId = req.user.id;
  const { violationLogs, logs } = getLogStores(type);
  const userViolations = (await violationLogs.get(userId)) ?? 0;
  const violationCount = userViolations + score;
  await violationLogs.set(userId, violationCount);
  errorMessage.violationCount = violationCount;
  errorMessage.date = new Date().toISOString();
  errorMessage.ip = req.ip;
  const userLogs = (await logs.get(userId)) ?? [];
  userLogs.push(errorMessage);
  await logs.set(userId, userLogs);
};

module.exports = logViolation;
