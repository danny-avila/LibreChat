const express = require('express');
const rateLimit = require('express-rate-limit');
const { createSetBalanceConfig, forceRefreshCloudFrontAuthCookies } = require('@librechat/api');
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
const { findBalanceByUser, upsertBalanceFields } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');
const middleware = require('~/server/middleware');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  findBalanceByUser,
  upsertBalanceFields,
});

const router = express.Router();
const { accessIpLimiter, accessUserLimiter } = middleware.createAccessLimiters();
/** Baseline IP rate limiter applied alongside the access limiters. */
const routeRateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 150 });
router.use(routeRateLimiter);
const getCloudFrontAuthCookieRefreshResult = (req, res) => {
  const warmedResult = req.cloudFrontAuthCookieRefreshResult;
  if (warmedResult && (warmedResult.attempted || !warmedResult.enabled)) {
    return warmedResult;
  }

  return forceRefreshCloudFrontAuthCookies(req, res, req.user);
};

const ldapAuth = !!process.env.LDAP_URL && !!process.env.LDAP_USER_SEARCH_BASE;
//Local
router.post(
  '/logout',
  accessIpLimiter,
  accessUserLimiter,
  middleware.requireJwtAuth,
  logoutController,
);
router.post(
  '/login',
  middleware.logHeaders,
  middleware.requireSameOrigin,
  middleware.loginLimiter,
  middleware.checkBan,
  middleware.validateEmailLogin,
  ldapAuth ? middleware.requireLdapAuth : middleware.requireLocalAuth,
  setBalanceConfig,
  loginController,
);
router.post('/refresh', accessIpLimiter, accessUserLimiter, refreshController);
router.post(
  '/cloudfront/refresh',
  accessIpLimiter,
  accessUserLimiter,
  middleware.requireJwtAuth,
  (req, res) => {
    const result = getCloudFrontAuthCookieRefreshResult(req, res);
    if (!result.enabled) {
      return res.sendStatus(404);
    }

    const status = result.refreshed ? 200 : 500;
    return res.status(status).json({
      ok: result.refreshed,
      expiresInSec: result.expiresInSec,
      refreshAfterSec: result.refreshAfterSec,
    });
  },
);
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
  middleware.resetPasswordLimiter,
  middleware.checkBan,
  middleware.validatePasswordReset,
  resetPasswordController,
);

router.post(
  '/2fa/enable',
  accessIpLimiter,
  accessUserLimiter,
  middleware.requireJwtAuth,
  enable2FA,
);
router.post(
  '/2fa/verify',
  accessIpLimiter,
  accessUserLimiter,
  middleware.requireJwtAuth,
  verify2FA,
);
router.post(
  '/2fa/verify-temp',
  accessIpLimiter,
  accessUserLimiter,
  middleware.checkBan,
  verify2FAWithTempToken,
);
router.post(
  '/2fa/confirm',
  accessIpLimiter,
  accessUserLimiter,
  middleware.requireJwtAuth,
  confirm2FA,
);
router.post(
  '/2fa/disable',
  accessIpLimiter,
  accessUserLimiter,
  middleware.requireJwtAuth,
  disable2FA,
);
router.post(
  '/2fa/backup/regenerate',
  accessIpLimiter,
  accessUserLimiter,
  middleware.requireJwtAuth,
  regenerateBackupCodes,
);

router.get(
  '/graph-token',
  accessIpLimiter,
  accessUserLimiter,
  middleware.requireJwtAuth,
  graphTokenController,
);

module.exports = router;
