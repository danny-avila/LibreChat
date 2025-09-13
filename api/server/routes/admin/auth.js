const express = require('express');
const passport = require('passport');
const { randomState } = require('openid-client');
const { createSetBalanceConfig } = require('@librechat/api');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { createOAuthHandler } = require('~/server/controllers/auth/oauth');
const { getAppConfig } = require('~/server/services/Config');
const { getOpenIdConfig } = require('~/strategies');
const middleware = require('~/server/middleware');
const { Balance } = require('~/db/models');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  Balance,
});

const router = express.Router();

router.post(
  '/login/local',
  middleware.logHeaders,
  middleware.loginLimiter,
  middleware.checkBan,
  middleware.requireLocalAuth,
  middleware.requireAdmin,
  setBalanceConfig,
  loginController,
);

router.get('/verify', middleware.requireJwtAuth, middleware.requireAdmin, (req, res) => {
  const { password: _p, totpSecret: _t, __v, ...user } = req.user;
  user.id = user._id.toString();
  res.status(200).json({ user });
});

router.get('/oauth/openid/check', (req, res) => {
  const openidConfig = getOpenIdConfig();
  if (!openidConfig) {
    return res.status(404).json({ message: 'OpenID configuration not found' });
  }
  res.status(200).json({ message: 'OpenID check successful' });
});

router.get('/oauth/openid', (req, res, next) => {
  return passport.authenticate('openidAdmin', {
    session: false,
    state: randomState(),
  })(req, res, next);
});

router.get(
  '/oauth/openid/callback',
  passport.authenticate('openidAdmin', {
    failureRedirect: `${process.env.DOMAIN_CLIENT}/oauth/error`,
    failureMessage: true,
    session: false,
  }),
  middleware.requireAdmin,
  setBalanceConfig,
  middleware.checkDomainAllowed,
  createOAuthHandler(
    (process.env.ADMIN_PANEL_URL || 'http://localhost:3000') + '/auth/openid/callback',
  ),
);

module.exports = router;
