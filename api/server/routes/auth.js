const express = require('express');
const { createSetBalanceConfig } = require('@librechat/api');
const { hashToken } = require('@librechat/data-schemas');
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
const { setAuthTokens } = require('~/server/services/AuthService');
const { findBalanceByUser, upsertBalanceFields } = require('~/models');
const { logger } = require('~/config/winston');
const { getAppConfig } = require('~/server/services/Config');
const middleware = require('~/server/middleware');
const db = require('~/models');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  findBalanceByUser,
  upsertBalanceFields,
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

router.post('/2fa/enable', middleware.requireJwtAuth, enable2FA);
router.post('/2fa/verify', middleware.requireJwtAuth, verify2FA);
router.post('/2fa/verify-temp', middleware.checkBan, verify2FAWithTempToken);
router.post('/2fa/confirm', middleware.requireJwtAuth, confirm2FA);
router.post('/2fa/disable', middleware.requireJwtAuth, disable2FA);
router.post('/2fa/backup/regenerate', middleware.requireJwtAuth, regenerateBackupCodes);

router.get('/graph-token', middleware.requireJwtAuth, graphTokenController);

router.get('/magic-link', async (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return res.redirect('/login?error=invalid_magic_link');
  }
  try {
    const hash = await hashToken(token);
    const link = await db.findMagicLink({ token: hash, active: true });
    if (!link) {
      return res.redirect('/login?error=invalid_magic_link');
    }

    let user;
    if (link.userId) {
      user = await db.findUser({ _id: link.userId });
      if (!user) {
        await db.updateMagicLink(link._id.toString(), { userId: null });
        link.userId = null;
      }
    }
    if (!link.userId) {
      user = await db.findUser({ email: link.email });
      if (!user) {
        user = await db.createUser(
          {
            email: link.email,
            provider: 'magic_link',
            role: 'USER',
            emailVerified: true,
            name: link.email.split('@')[0],
          },
          undefined,
          true,
          true,
        );
      }
      await db.updateMagicLink(link._id.toString(), { userId: user._id });
    }

    if (!user) {
      return res.redirect('/login?error=invalid_magic_link');
    }

    await db.updateMagicLink(link._id.toString(), {
      useCount: (link.useCount ?? 0) + 1,
      lastUsedAt: new Date(),
    });

    await setAuthTokens(user._id.toString(), res);
    return res.redirect('/');
  } catch (err) {
    logger.error('[magic-link login]', err);
    return res.redirect('/login?error=invalid_magic_link');
  }
});

module.exports = router;
