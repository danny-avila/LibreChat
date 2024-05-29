const express = require('express');
const {
  resetPasswordRequestController,
  resetPasswordController,
  refreshController,
  registrationController,
} = require('../controllers/AuthController');
const { loginController } = require('../controllers/auth/LoginController');
const { logoutController } = require('../controllers/auth/LogoutController');
const {
  checkBan,
  loginLimiter,
  registerLimiter,
  requireJwtAuth,
  requireLdapAuth,
  requireLocalAuth,
  validateRegistration,
} = require('../middleware');

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
router.post('/requestPasswordReset', resetPasswordRequestController);
router.post('/resetPassword', resetPasswordController);

module.exports = router;
