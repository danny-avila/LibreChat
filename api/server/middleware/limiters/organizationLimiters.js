const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const { limiterCache, removePorts } = require('@librechat/api');
const { logViolation } = require('~/cache');

const {
  ORGANIZATION_CREATE_USER_MAX = 5,
  ORGANIZATION_CREATE_USER_WINDOW = 60,
  ORGANIZATION_INVITE_IP_MAX = 30,
  ORGANIZATION_INVITE_IP_WINDOW = 15,
  ORGANIZATION_INVITE_USER_MAX = 50,
  ORGANIZATION_INVITE_USER_WINDOW = 60,
  ORGANIZATION_VIOLATION_SCORE: score,
} = process.env;

const accountKey = (req) =>
  req.organizationAccount?._id?.toString() ?? req.user?.id ?? removePorts(req);

const createLimiter = ({ max, windowInMinutes, type, keyGenerator, storeName }) => {
  const message = `Too many attempts, please try again after ${windowInMinutes} minute(s)`;
  return rateLimit({
    windowMs: windowInMinutes * 60 * 1000,
    max,
    keyGenerator,
    store: limiterCache(storeName),
    handler: async (req, res) => {
      await logViolation(req, res, type, { type, max, windowInMinutes }, score);
      return res.status(429).json({ message });
    },
  });
};

/** Creating organizations, per login account. */
const organizationCreateLimiter = createLimiter({
  max: Number(ORGANIZATION_CREATE_USER_MAX),
  windowInMinutes: Number(ORGANIZATION_CREATE_USER_WINDOW),
  type: ViolationTypes.REGISTRATIONS,
  keyGenerator: accountKey,
  storeName: 'organization_create_limiter',
});

/** Opening and accepting invite links, per source address. */
const organizationInviteIpLimiter = createLimiter({
  max: Number(ORGANIZATION_INVITE_IP_MAX),
  windowInMinutes: Number(ORGANIZATION_INVITE_IP_WINDOW),
  type: ViolationTypes.GENERAL,
  keyGenerator: removePorts,
  storeName: 'organization_invite_ip_limiter',
});

/** Sending and re-sending invites, per inviting member. */
const organizationInviteUserLimiter = createLimiter({
  max: Number(ORGANIZATION_INVITE_USER_MAX),
  windowInMinutes: Number(ORGANIZATION_INVITE_USER_WINDOW),
  type: ViolationTypes.GENERAL,
  keyGenerator: (req) => req.user?.id ?? removePorts(req),
  storeName: 'organization_invite_user_limiter',
});

module.exports = {
  organizationCreateLimiter,
  organizationInviteIpLimiter,
  organizationInviteUserLimiter,
};
