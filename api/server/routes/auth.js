const express = require('express');
const {
  resetPasswordRequestController,
  resetPasswordController,
  verifyEmailController,
  refreshController,
  registrationController,
} = require('~/server/controllers/AuthController');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { logoutController } = require('~/server/controllers/auth/LogoutController');
const {
  checkBan,
  loginLimiter,
  requireJwtAuth,
  registerLimiter,
  requireLdapAuth,
  requireLocalAuth,
  verifyEmailLimiter,
  resetPasswordLimiter,
  validateRegistration,
  validatePasswordReset,
} = require('~/server/middleware');

const router = express.Router();

const ldapAuth =
  !!process.env.LDAP_URL && !!process.env.LDAP_BIND_DN && !!process.env.LDAP_USER_SEARCH_BASE;
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
router.post('/register', registerLimiter, checkBan, validateRegistration, registrationController);
router.post(
  '/requestPasswordReset',
  resetPasswordLimiter,
  checkBan,
  validatePasswordReset,
  resetPasswordRequestController,
);
router.post('/resetPassword', checkBan, validatePasswordReset, resetPasswordController);
router.post('/verify', verifyEmailLimiter, verifyEmailController);

module.exports = router;
