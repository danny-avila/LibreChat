const express = require('express');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { getAppConfig } = require('~/server/services/Config');
const { createSetBalanceConfig } = require('@librechat/api');
const middleware = require('~/server/middleware');
const { Balance } = require('~/db/models');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  Balance,
});

const router = express.Router();

// Admin local authentication route - reuses main login controller
router.post(
  '/login/local',
  middleware.logHeaders,
  middleware.loginLimiter,
  middleware.checkBan,
  middleware.requireLocalAuth, // Standard local auth
  middleware.requireAdmin, // Then check if user is admin
  setBalanceConfig,
  loginController, // Reuse existing login controller
);

// Admin token verification endpoint - simple JWT verify + admin check
router.get(
  '/verify',
  middleware.requireJwtAuth, // Standard JWT auth
  middleware.requireAdmin, // Then check if user is admin
  (req, res) => {
    // Simple response - user is already verified by middleware
    const { password: _p, totpSecret: _t, __v, ...user } = req.user;
    user.id = user._id.toString();
    res.status(200).json({ user });
  },
);

// TODO: Future OAuth/OpenID routes will be added here
// router.get('/auth/openid', ...);
// router.get('/auth/openid/callback', ...);

module.exports = router;
