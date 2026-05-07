const express = require('express');
const rateLimit = require('express-rate-limit');
const { createSetBalanceConfig, limiterCache } = require('@librechat/api');
const { logger, AdminAuditActions } = require('@librechat/data-schemas');
const { AdminAuditLog } = require('~/db/models');
const impersonateService = require('~/server/services/admin/impersonate');
const { setAuthTokens } = require('~/server/services/AuthService');
const {
  resetPasswordRequestController,
  resetPasswordController,
  registrationController,
  graphTokenController,
  refreshController,
} = require('~/server/controllers/AuthController');
const {
  regenerateBackupCodes,
  disable2FA,
  confirm2FA,
  enable2FA,
  verify2FA,
} = require('~/server/controllers/TwoFactorController');
const { verify2FAWithTempToken } = require('~/server/controllers/auth/TwoFactorAuthController');
const { logoutController } = require('~/server/controllers/auth/LogoutController');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { getAppConfig } = require('~/server/services/Config');
const middleware = require('~/server/middleware');
const { Balance } = require('~/db/models');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  Balance,
});

const router = express.Router();

const ldapAuth = !!process.env.LDAP_URL && !!process.env.LDAP_USER_SEARCH_BASE;
//Local
router.post('/logout', middleware.requireJwtAuth, logoutController);
router.post(
  '/login',
  middleware.logHeaders,
  middleware.loginLimiter,
  middleware.checkBan,
  ldapAuth ? middleware.requireLdapAuth : middleware.requireLocalAuth,
  setBalanceConfig,
  loginController,
);
router.post('/refresh', refreshController);
router.post(
  '/register',
  middleware.registerLimiter,
  middleware.checkBan,
  middleware.checkInviteUser,
  middleware.validateRegistration,
  registrationController,
);
router.post(
  '/requestPasswordReset',
  middleware.resetPasswordLimiter,
  middleware.checkBan,
  middleware.validatePasswordReset,
  resetPasswordRequestController,
);
router.post(
  '/resetPassword',
  middleware.checkBan,
  middleware.validatePasswordReset,
  resetPasswordController,
);

router.get('/2fa/enable', middleware.requireJwtAuth, enable2FA);
router.post('/2fa/verify', middleware.requireJwtAuth, verify2FA);
router.post('/2fa/verify-temp', middleware.checkBan, verify2FAWithTempToken);
router.post('/2fa/confirm', middleware.requireJwtAuth, confirm2FA);
router.post('/2fa/disable', middleware.requireJwtAuth, disable2FA);
router.post('/2fa/backup/regenerate', middleware.requireJwtAuth, regenerateBackupCodes);

router.get('/graph-token', middleware.requireJwtAuth, graphTokenController);

/**
 * POST /api/auth/impersonate
 *
 * Public endpoint — the one-shot HMAC token in the body IS the auth. Issued
 * by /api/admin/users/:id/impersonate after fresh-auth. Each token is valid
 * for ~5 minutes and can be consumed exactly once.
 *
 * Refuses if the caller already has a session JWT (don't blend sessions).
 *
 * On success, sets the same cookies and returns the same shape as /login,
 * but for the *target* user.
 */
const impersonateConsumeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  store: limiterCache('impersonate_consume_limiter'),
  handler: (_req, res) =>
    res.status(429).json({ message: 'Too many impersonation attempts, slow down.' }),
});

router.post('/impersonate', middleware.checkBan, impersonateConsumeLimiter, async (req, res) => {
  // Refuse if there's already a session — prevents accidental session blending
  // and makes audit unambiguous.
  const hasBearer =
    typeof req.headers?.authorization === 'string' &&
    req.headers.authorization.startsWith('Bearer ');
  if (hasBearer) {
    return res.status(400).json({
      message: 'Log out before consuming an impersonation token',
      code: 'ALREADY_AUTHENTICATED',
    });
  }

  const token = req.body?.token;
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ message: 'token is required', code: 'TOKEN_REQUIRED' });
  }

  try {
    const { target, record } = await impersonateService.consumeImpersonationToken({
      token,
      ip: req.ip || null,
      userAgent: req.headers?.['user-agent'] || null,
    });

    // Mint a normal session JWT + refresh cookie for the target user.
    const sessionToken = await setAuthTokens(target._id, res);
    const { password: _p, totpSecret: _t, __v, ...safeUser } = target;
    safeUser.id = target._id.toString();

    // Durable audit row attributing the consumed session to the original admin.
    try {
      await AdminAuditLog.create({
        actorId: record.actorId,
        actorEmail: record.actorEmail,
        actorIp: req.ip || null,
        userAgent: req.headers?.['user-agent'] || null,
        action: AdminAuditActions.USER_IMPERSONATE_CONSUMED,
        targetType: 'user',
        targetId: record.targetUserId,
        meta: {
          jti: record.jti,
          targetEmail: record.targetEmail,
        },
        reason: record.reason,
        status: 'success',
      });
    } catch (err) {
      logger.error('[auth /impersonate] failed to write audit row', err);
    }

    return res.status(200).json({ token: sessionToken, user: safeUser });
  } catch (err) {
    const status = err && err.status ? err.status : 400;
    const code = err && err.code ? err.code : 'INVALID_TOKEN';
    const message = err && err.message ? err.message : 'Invalid token';

    // Best-effort failure log. We can only persist a structured audit row
    // when we have a known actor; signature failures and malformed tokens
    // are logged at WARN level instead so attackers can't poison the audit
    // collection with forged actor ids.
    logger.warn('[auth /impersonate] consume failed', {
      code,
      message,
      ip: req.ip || null,
      userAgent: req.headers?.['user-agent'] || null,
    });

    return res.status(status).json({ message, code });
  }
});

module.exports = router;
