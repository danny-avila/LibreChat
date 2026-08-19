const jwt = require('jsonwebtoken');
const { createHash } = require('crypto');
const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const { limiterCache, removePorts } = require('@librechat/api');
const { logViolation } = require('~/cache');

const {
  LOGIN_WINDOW = 5,
  LOGIN_MAX = 7,
  LOGIN_VIOLATION_SCORE,
  TWO_FACTOR_TEMP_WINDOW = LOGIN_WINDOW,
  TWO_FACTOR_TEMP_MAX = LOGIN_MAX,
  TWO_FACTOR_TEMP_VIOLATION_SCORE,
} = process.env;
const windowMs = TWO_FACTOR_TEMP_WINDOW * 60 * 1000;
const max = TWO_FACTOR_TEMP_MAX;
const score = TWO_FACTOR_TEMP_VIOLATION_SCORE ?? LOGIN_VIOLATION_SCORE;
const windowInMinutes = windowMs / 60000;
const message = `Too many verification attempts, please try again after ${windowInMinutes} minutes.`;

const hashLimiterKey = (value) => createHash('sha256').update(value).digest('hex');

const getUserLimiterKey = (req) => {
  const userId = req.user?.id ?? req.user?._id;
  if (userId) {
    return `user:${userId.toString()}`;
  }

  const tempToken = req.body?.tempToken;
  if (typeof tempToken === 'string' && tempToken) {
    return `temp:${hashLimiterKey(tempToken)}`;
  }

  const ip = removePorts(req);
  return ip ? `ip:${ip}` : 'ip:unknown';
};

const getTempTokenUserId = (tempToken) => {
  if (!tempToken) {
    return null;
  }

  try {
    const payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    return payload?.userId ?? null;
  } catch {
    return null;
  }
};

const createHandler = (limiter) => async (req, res) => {
  const type = ViolationTypes.LOGINS;
  const errorMessage = {
    type,
    max,
    limiter,
    windowInMinutes,
  };

  const userId = getTempTokenUserId(req.body?.tempToken);
  if (userId && !req.user) {
    req.user = { id: userId };
  } else if (userId && !req.user.id && !req.user._id) {
    req.user.id = userId;
  }

  await logViolation(req, res, type, errorMessage, score);
  return res.status(429).json({ message });
};

const ipLimiterOptions = {
  windowMs,
  max,
  handler: createHandler('ip'),
  keyGenerator: removePorts,
  store: limiterCache('two_factor_temp_limiter'),
};

const userLimiterOptions = {
  windowMs,
  max,
  handler: createHandler('user'),
  keyGenerator: getUserLimiterKey,
  store: limiterCache('two_factor_temp_user_limiter'),
};

const twoFactorTempIpLimiter = rateLimit(ipLimiterOptions);
const twoFactorTempUserLimiter = rateLimit(userLimiterOptions);

const twoFactorTempLimiter = (req, res, next) => {
  twoFactorTempIpLimiter(req, res, (err) => {
    if (err) {
      return next(err);
    }

    return twoFactorTempUserLimiter(req, res, next);
  });
};

module.exports = twoFactorTempLimiter;
