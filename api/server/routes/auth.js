const express = require('express');
const {
  refreshController,
  registrationController,
  resetPasswordController,
  resetPasswordRequestController,
} = require('~/server/controllers/AuthController');
const { refreshController: customRefreshController } = require('~/server/controllers/CustomAuthController');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { customBackendLoginController } = require('~/server/controllers/auth/CustomBackendLoginController');
const { logoutController } = require('~/server/controllers/auth/LogoutController');
const { verify2FAWithTempToken } = require('~/server/controllers/auth/TwoFactorAuthController');
const {
  enable2FA,
  verify2FA,
  disable2FA,
  regenerateBackupCodes,
  confirm2FA,
} = require('~/server/controllers/TwoFactorController');
const {
  checkBan,
  logHeaders,
  loginLimiter,
  requireJwtAuth,
  checkInviteUser,
  registerLimiter,
  requireLdapAuth,
  setBalanceConfig,
  requireLocalAuth,
  resetPasswordLimiter,
  validateRegistration,
  validatePasswordReset,
  requireCustomBackendAuth,
} = require('~/server/middleware');

const router = express.Router();

const ldapAuth = !!process.env.LDAP_URL && !!process.env.LDAP_USER_SEARCH_BASE;
const customBackendAuth = !!process.env.USE_CUSTOM_BACKEND_AUTH;
//Local
router.post('/logout', requireJwtAuth, logoutController);
router.post(
  '/login',
  logHeaders,
  loginLimiter,
  checkBan,
  customBackendAuth ? requireCustomBackendAuth : (ldapAuth ? requireLdapAuth : requireLocalAuth),
  setBalanceConfig,
  customBackendAuth ? customBackendLoginController : loginController,
);
router.post('/refresh', customBackendAuth ? customRefreshController : refreshController);
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

router.get('/2fa/enable', requireJwtAuth, enable2FA);
router.post('/2fa/verify', requireJwtAuth, verify2FA);
router.post('/2fa/verify-temp', checkBan, verify2FAWithTempToken);
router.post('/2fa/confirm', requireJwtAuth, confirm2FA);
router.post('/2fa/disable', requireJwtAuth, disable2FA);
router.post('/2fa/backup/regenerate', requireJwtAuth, regenerateBackupCodes);

module.exports = router;
