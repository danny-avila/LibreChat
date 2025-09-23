// api/server/routes/auth.js
const express = require('express');
const { createSetBalanceConfig } = require('@librechat/api');
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

// Configure balance integration
const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  Balance,
});

// Initialize router
const router = express.Router();

// Determine LDAP availability with fallback
const ldapAuth = process.env.LDAP_URL && process.env.LDAP_USER_SEARCH_BASE;
const requireAuthMiddleware = ldapAuth ? middleware.requireLdapAuth : middleware.requireLocalAuth;

// Centralize security middleware
const applySecurityMiddleware = (req, res, next) => {
  try {
    middleware.checkBan(req, res, (err) => {
      if (err) return res.status(403).json({ error: 'User is banned' });
      next();
    });
  } catch (error) {
    console.error('Security middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Authentication Routes
router.post('/logout', middleware.requireJwtAuth, logoutController);

router.post(
  '/login',
  middleware.logHeaders,
  middleware.rateLimitMiddleware, // Replace loginLimiter with Redis-based
  applySecurityMiddleware,
  requireAuthMiddleware,
  setBalanceConfig,
  loginController,
);

router.post('/refresh', refreshController);

router.post(
  '/register',
  middleware.rateLimitMiddleware, // Replace registerLimiter with Redis-based
  applySecurityMiddleware,
  middleware.checkInviteUser,
  middleware.validateRegistration,
  registrationController,
);

router.post(
  '/requestPasswordReset',
  middleware.rateLimitMiddleware, // Replace resetPasswordLimiter with Redis-based
  applySecurityMiddleware,
  middleware.validatePasswordReset,
  resetPasswordRequestController,
);

router.post(
  '/resetPassword',
  applySecurityMiddleware,
  middleware.validatePasswordReset,
  resetPasswordController,
);

// Two-Factor Authentication Routes
router.get('/2fa/enable', middleware.requireJwtAuth, enable2FA);

router.post('/2fa/verify', middleware.requireJwtAuth, verify2FA);

router.post(
  '/2fa/verify-temp',
  applySecurityMiddleware,
  middleware.rateLimitMiddleware, // Added for security against abuse
  verify2FAWithTempToken,
);

router.post('/2fa/confirm', middleware.requireJwtAuth, confirm2FA);

router.post('/2fa/disable', middleware.requireJwtAuth, disable2FA);

router.post('/2fa/backup/regenerate', middleware.requireJwtAuth, regenerateBackupCodes);

// Additional Auth Routes
router.get('/graph-token', middleware.requireJwtAuth, graphTokenController);

module.exports = router;
