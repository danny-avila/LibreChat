const Keyv = require('keyv');
const keyvMongo = require('./keyvMongo');
const Session = require('../models/Session');
const { isEnabled, math, removePorts } = require('../server/utils');

/**
 * Bans a user based on violation criteria.
 *
 * If the user's violation count is a multiple of the BAN_INTERVAL, the user will be banned.
 * The duration of the ban is determined by the BAN_DURATION environment variable.
 * If BAN_DURATION is not set or invalid, the user will not be banned.
 * If the user is banned, their sessions will be deleted and the refreshToken cookie will be cleared.
 *
 * @async
 * @param {Object} req - Express request object containing user information.
 * @param {Object} res - Express response object.
 * @param {Object} errorMessage - Object containing user violation details.
 * @param {string} errorMessage.type - Type of the violation.
 * @param {string} errorMessage.user_id - ID of the user who committed the violation.
 * @param {number} errorMessage.violation_count - Number of violations committed by the user.
 *
 * @returns {Promise<void>}
 *
 */
const banViolation = async (req, res, errorMessage) => {
  const { BAN_VIOLATIONS, BAN_DURATION, BAN_INTERVAL } = process.env ?? {};

  if (!isEnabled(BAN_VIOLATIONS)) {
    return;
  }

  if (!errorMessage) {
    return;
  }

  const { type, user_id, violation_count } = errorMessage;

  let interval, duration;
  try {
    interval = math(BAN_INTERVAL);
  } catch {
    interval = 20;
  }

  if (violation_count % interval !== 0) {
    return;
  }

  try {
    duration = math(BAN_DURATION);
  } catch {
    duration = 0;
  }

  if (duration > 0) {
    req.ip = removePorts(req);
    console.log('Banning user', user_id, 'for', duration, 'ms');
    console.log('Banned user IP:', req.ip);
    const expiresAt = Date.now() + duration;
    const banLogs = new Keyv({ store: keyvMongo, ttl: duration, namespace: 'bans' });
    await banLogs.set(user_id, { type, violation_count, duration, expiresAt });
    await banLogs.set(req.ip, { type, user_id, violation_count, duration, expiresAt });
  }

  await Session.deleteAllUserSessions(user_id);

  res.clearCookie('refreshToken');

  errorMessage.ban = true;
  errorMessage.ban_duration = duration;

  return;
};

module.exports = banViolation;
