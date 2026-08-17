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
  TWO_FACTOR_SETUP_WINDOW = TWO_FACTOR_TEMP_WINDOW,
  TWO_FACTOR_SETUP_MAX = 20,
  TWO_FACTOR_SETUP_VIOLATION_SCORE,
} = process.env;

const hashLimiterKey = (value) => createHash('sha256').update(value).digest('hex');
const hasResolvedTempUser = (req) => Boolean(req.user?.id ?? req.user?._id);

const getEnrollmentToken = (req) =>
  req.body?.tempToken ?? req.body?.acknowledgementToken ?? req.body?.finalizationToken;

const getUserLimiterKey = (req) => {
  const userId = req.user?.id ?? req.user?._id;
  if (userId) {
    return `user:${userId.toString()}`;
  }

  const tempToken = getEnrollmentToken(req);
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

/**
 * Builds the IP-then-user limiter pair for one two-factor quota. Each `namespace` owns its own
 * cache prefixes, so quotas built here never draw down one another.
 */
const createTwoFactorLimiter = ({ namespace, windowMinutes, max, score, describeAttempts }) => {
  const windowMs = windowMinutes * 60 * 1000;
  const windowInMinutes = windowMs / 60000;
  const message = `Too many ${describeAttempts}, please try again after ${windowInMinutes} minutes.`;

  const createHandler = (limiter) => async (req, res) => {
    const type = ViolationTypes.LOGINS;
    const errorMessage = {
      type,
      max,
      limiter,
      windowInMinutes,
    };

    const userId = getTempTokenUserId(getEnrollmentToken(req));
    if (userId && !req.user) {
      req.user = { id: userId };
    } else if (userId && !req.user.id && !req.user._id) {
      req.user.id = userId;
    }

    await logViolation(req, res, type, errorMessage, score);
    return res.status(429).json({ message });
  };

  const ipLimiter = rateLimit({
    windowMs,
    max,
    skip: hasResolvedTempUser,
    handler: createHandler('ip'),
    keyGenerator: removePorts,
    store: limiterCache(`${namespace}_limiter`),
  });

  const userLimiter = rateLimit({
    windowMs,
    max,
    handler: createHandler('user'),
    keyGenerator: getUserLimiterKey,
    store: limiterCache(`${namespace}_user_limiter`),
  });

  return (req, res, next) => {
    ipLimiter(req, res, (err) => {
      if (err) {
        return next(err);
      }

      return userLimiter(req, res, next);
    });
  };
};

/** Guards code guessing: the login challenge and the enrollment TOTP confirmation. */
const twoFactorTempLimiter = createTwoFactorLimiter({
  namespace: 'two_factor_temp',
  windowMinutes: TWO_FACTOR_TEMP_WINDOW,
  max: TWO_FACTOR_TEMP_MAX,
  score: TWO_FACTOR_TEMP_VIOLATION_SCORE ?? LOGIN_VIOLATION_SCORE,
  describeAttempts: 'verification attempts',
});

/**
 * Guards the enrollment transitions that check no guessable secret: issuing the QR code, and
 * redeeming the single-use acknowledgement and finalization nonces. Deliberately a separate quota,
 * because sharing one with code guessing lets a handful of wrong codes strand a user who already
 * holds their backup codes but has not yet been promoted.
 */
const twoFactorSetupLimiter = createTwoFactorLimiter({
  namespace: 'two_factor_setup',
  windowMinutes: TWO_FACTOR_SETUP_WINDOW,
  max: TWO_FACTOR_SETUP_MAX,
  score:
    TWO_FACTOR_SETUP_VIOLATION_SCORE ?? TWO_FACTOR_TEMP_VIOLATION_SCORE ?? LOGIN_VIOLATION_SCORE,
  describeAttempts: 'two-factor setup requests',
});

module.exports = twoFactorTempLimiter;
module.exports.twoFactorSetupLimiter = twoFactorSetupLimiter;
