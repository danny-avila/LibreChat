const express = require('express');
const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');
const { logger, AdminAuditActions } = require('@librechat/data-schemas');
const {
  requireJwtAuth,
  checkBan,
  checkAdmin,
  adminRateLimiter,
  checkAdminIpAllowlist,
  auditLogger,
  issueFreshAuthToken,
} = require('~/server/middleware');
const { findUser, comparePassword } = require('~/models');

const router = express.Router();

// Per-admin reauth attempt limiter: 5 per 5 minutes.
// In addition to `adminRateLimiter`, this is a password-stuffing guard within
// an established admin session.
const reauthAttemptLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `reauth:${req.user?.id || req.ip}`,
  store: limiterCache('admin_reauth_limiter'),
  handler: (_req, res) => res.status(429).json({ message: 'Too many reauth attempts, slow down.' }),
});

router.post(
  '/reauth',
  requireJwtAuth,
  checkBan,
  checkAdmin,
  checkAdminIpAllowlist,
  adminRateLimiter,
  reauthAttemptLimiter,
  auditLogger(AdminAuditActions.REAUTH, { targetType: 'system' }),
  async (req, res) => {
    const genericFailure = { message: 'Invalid credentials' };
    try {
      const password = req.body?.password;
      if (!password || typeof password !== 'string') {
        return res.status(401).json(genericFailure);
      }

      const user = await findUser({ _id: req.user._id || req.user.id }, '+password');
      if (!user || !user.password) {
        return res.status(401).json(genericFailure);
      }

      const ok = await comparePassword(user, password);
      if (!ok) {
        return res.status(401).json(genericFailure);
      }

      const { token, expiresAt } = issueFreshAuthToken(req.user.id || req.user._id.toString());
      return res.status(200).json({ token, expiresAt });
    } catch (err) {
      logger.error('[admin /reauth] error', err);
      return res.status(401).json(genericFailure);
    }
  },
);

module.exports = router;
