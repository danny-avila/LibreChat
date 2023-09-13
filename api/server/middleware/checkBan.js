const Keyv = require('keyv');
const uap = require('ua-parser-js');
const { getLogStores } = require('../../cache');
const denyRequest = require('./denyRequest');
const { isEnabled, removePorts } = require('../utils');

const banCache = new Keyv({ namespace: 'bans', ttl: 0 });
const message = 'Your account has been temporarily banned due to violations of our service.';

/**
 * Respond to the request if the user is banned.
 *
 * @async
 * @function
 * @param {Object} req - Express Request object.
 * @param {Object} res - Express Response object.
 * @param {String} errorMessage - Error message to be displayed in case of /api/ask or /api/edit request.
 *
 * @returns {Promise<Object>} - Returns a Promise which when resolved sends a response status of 403 with a specific message if request is not of api/ask or api/edit types. If it is, calls `denyRequest()` function.
 */
const banResponse = async (req, res) => {
  const ua = uap(req.headers['user-agent']);
  const { baseUrl } = req;
  if (!ua.browser.name) {
    return res.status(403).json({ message });
  } else if (baseUrl === '/api/ask' || baseUrl === '/api/edit') {
    return await denyRequest(req, res, { type: 'ban' });
  }

  return res.status(403).json({ message });
};

/**
 * Checks if the source IP or user is banned or not.
 *
 * @async
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Next middleware function.
 *
 * @returns {Promise<function|Object>} - Returns a Promise which when resolved calls next middleware if user or source IP is not banned. Otherwise calls `banResponse()` and sets ban details in `banCache`.
 */
const checkBan = async (req, res, next = () => {}) => {
  const { BAN_VIOLATIONS } = process.env ?? {};

  if (!isEnabled(BAN_VIOLATIONS)) {
    return next();
  }

  req.ip = removePorts(req);
  const userId = req.user?.id ?? req.user?._id ?? null;

  const cachedIPBan = await banCache.get(req.ip);
  const cachedUserBan = await banCache.get(userId);
  const cachedBan = cachedIPBan || cachedUserBan;

  if (cachedBan) {
    req.banned = true;
    return await banResponse(req, res);
  }

  const banLogs = getLogStores('ban');
  const duration = banLogs.opts.ttl;

  if (duration <= 0) {
    return next();
  }

  const ipBan = await banLogs.get(req.ip);
  const userBan = await banLogs.get(userId);
  const isBanned = ipBan || userBan;

  if (!isBanned) {
    return next();
  }

  const timeLeft = Number(isBanned.expiresAt) - Date.now();

  if (timeLeft <= 0) {
    await banLogs.delete(req.ip);
    await banLogs.delete(userId);
    return next();
  }

  banCache.set(req.ip, isBanned, timeLeft);
  banCache.set(userId, isBanned, timeLeft);
  req.banned = true;
  return await banResponse(req, res);
};

module.exports = checkBan;
