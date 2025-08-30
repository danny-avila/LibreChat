const express = require('express');
const { adminVerifyController } = require('~/server/controllers/auth/AdminVerifyController');
const { adminLoginController } = require('~/server/controllers/auth/AdminLoginController');
const middleware = require('~/server/middleware');

const router = express.Router();

// Admin local authentication route
router.post(
  '/login/local',
  middleware.logHeaders,
  middleware.loginLimiter,
  middleware.checkBan,
  middleware.requireAdminAuth, // Uses local auth strategy + admin role validation
  adminLoginController,
);

// Admin token verification endpoint
router.get(
  '/verify',
  middleware.requireAdminJwtAuth, // Validates JWT + admin role
  adminVerifyController,
);

// TODO: Future OAuth/OpenID routes will be added here
// router.get('/auth/openid', ...);
// router.get('/auth/openid/callback', ...);

module.exports = router;
