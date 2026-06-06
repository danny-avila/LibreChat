const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
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

const handler = async (req, res) => {
  const type = ViolationTypes.LOGINS;
  const errorMessage = {
    type,
    max,
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

const limiterOptions = {
  windowMs,
  max,
  handler,
  keyGenerator: removePorts,
  store: limiterCache('two_factor_temp_limiter'),
};

const twoFactorTempLimiter = rateLimit(limiterOptions);

module.exports = twoFactorTempLimiter;
