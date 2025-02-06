const express = require('express');
const {
  refreshController,
  registrationController,
  resetPasswordController,
  resetPasswordRequestController,
} = require('~/server/controllers/AuthController');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { logoutController } = require('~/server/controllers/auth/LogoutController');
const { verify2FA } = require('~/server/controllers/auth/TwoFactorAuthController');
const {
  enable2FAController,
  verify2FAController,
  disable2FAController,
  regenerateBackupCodesController, confirm2FAController,
} = require('~/server/controllers/TwoFactorController');
const {
  checkBan,
  loginLimiter,
  requireJwtAuth,
  checkInviteUser,
  registerLimiter,
  requireLdapAuth,
  requireLocalAuth,
  resetPasswordLimiter,
  validateRegistration,
  validatePasswordReset,
} = require('~/server/middleware');

const router = express.Router();

const ldapAuth = !!process.env.LDAP_URL && !!process.env.LDAP_USER_SEARCH_BASE;
//Local
router.post('/logout', requireJwtAuth, logoutController);
router.post(
  '/login',
  loginLimiter,
  checkBan,
  ldapAuth ? requireLdapAuth : requireLocalAuth,
  loginController,
);
router.post('/refresh', refreshController);
router.post(
  '/register',
  registerLimiter,
  checkBan,
  checkInviteUser,
  validateRegistration,
  registrationController,
);
router.post(
  '/requestPasswordReset',
  resetPasswordLimiter,
  checkBan,
  validatePasswordReset,
  resetPasswordRequestController,
);
router.post('/resetPassword', checkBan, validatePasswordReset, resetPasswordController);

router.get('/2fa/enable', requireJwtAuth, enable2FAController);
router.post('/2fa/verify', requireJwtAuth, verify2FAController);
router.post('/2fa/verify-temp', checkBan, verify2FA);
router.post('/2fa/confirm', requireJwtAuth, confirm2FAController);
router.post('/2fa/disable', requireJwtAuth, disable2FAController);
router.post('/2fa/backup/regenerate', requireJwtAuth, regenerateBackupCodesController);

module.exports = router;
