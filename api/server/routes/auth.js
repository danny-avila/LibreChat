const express = require('express');
const mongoose = require('mongoose');
const {
  math,
  isEnabled,
  createSetBalanceConfig,
  serializeUserForResponse,
  resolveClerkAuthConfig,
  createClerkAuthHandlers,
  recordClerkSessionOutcome,
  createExchangeClerkSession,
  forceRefreshCloudFrontAuthCookies,
  createFinalizeClerkTwoFactorSession,
  createMongooseClerkSessionPersistence,
} = require('@librechat/api');
const { logger, toClerkTenantScope, DEFAULT_SESSION_EXPIRY } = require('@librechat/data-schemas');
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
const {
  createVerify2FAWithTempToken,
} = require('~/server/controllers/auth/TwoFactorAuthController');
const {
  createLoginLimiter,
  clerkLoginLimiterHandler,
} = require('~/server/middleware/limiters/loginLimiter');
const { logoutController } = require('~/server/controllers/auth/LogoutController');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { signTwoFactorTempToken } = require('~/server/services/twoFactorService');
const { createCheckBan } = require('~/server/middleware/checkBan');
const { setAuthTokens } = require('~/server/services/AuthService');
const { createSocialUser } = require('~/strategies/process');
const { getAppConfig } = require('~/server/services/Config');
const middleware = require('~/server/middleware');
const {
  findUser,
  createSession,
  findSession,
  deleteSession,
  upsertUserState,
  linkClerkIdentity,
  findBalanceByUser,
  upsertBalanceFields,
  upsertSessionState,
  insertConsumedTokenClaim,
} = require('~/models');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  findBalanceByUser,
  upsertBalanceFields,
});

/**
 * Fixed Contract 7 completion dependencies: the single Mongo transaction
 * boundary (persistence), the real local-login `setAuthTokens`/2FA temp-token
 * signer (unchanged shape, adapted only), and the shared public serializer.
 * No Clerk decision logic lives in this file — every dependency here is an
 * already-tested typed/legacy function; this object only wires them together.
 */
const clerkSessionPersistence = createMongooseClerkSessionPersistence({
  startSession: () => mongoose.startSession(),
  methods: {
    findUser,
    createSession,
    findSession,
    deleteSession,
    upsertUserState,
    upsertSessionState,
    insertConsumedTokenClaim,
  },
  now: () => new Date(),
});

const clerkSessionCompletionDeps = {
  now: () => new Date(),
  getSessionExpiryMs: () => math(process.env.SESSION_EXPIRY, DEFAULT_SESSION_EXPIRY),
  toTenantScope: toClerkTenantScope,
  signTwoFactorTempToken,
  persistClerkSession: clerkSessionPersistence.persistClerkSession,
  confirmClerkSession: clerkSessionPersistence.confirmClerkSession,
  setAuthTokens: ({ userId, req, res, session }) => setAuthTokens(userId, res, session, req),
  deleteSession: clerkSessionPersistence.deleteSession,
  serializeUser: serializeUserForResponse,
  beforeResponse: async () => {},
  recordOutcome: recordClerkSessionOutcome,
  logPostCommitFailure: (message) => logger.error(message),
};

const clerkAuthHandlers = createClerkAuthHandlers({
  getClerkAuthConfig: () => resolveClerkAuthConfig(process.env),
  findUser,
  getAppConfig,
  isSocialRegistrationAllowed: () => isEnabled(process.env.ALLOW_SOCIAL_REGISTRATION),
  linkClerkIdentity,
  createSocialUser,
  exchangeClerkSession: createExchangeClerkSession(clerkSessionCompletionDeps),
});

const verify2FAWithTempToken = createVerify2FAWithTempToken({
  finalizeClerkTwoFactorSession: createFinalizeClerkTwoFactorSession(clerkSessionCompletionDeps),
});

const router = express.Router();
const getCloudFrontAuthCookieRefreshResult = (req, res) => {
  const warmedResult = req.cloudFrontAuthCookieRefreshResult;
  if (warmedResult && (warmedResult.attempted || !warmedResult.enabled)) {
    return warmedResult;
  }

  return forceRefreshCloudFrontAuthCookies(req, res, req.user);
};

const ldapAuth = !!process.env.LDAP_URL && !!process.env.LDAP_USER_SEARCH_BASE;
//Local
router.post('/logout', middleware.requireJwtAuth, logoutController);
router.post(
  '/login',
  middleware.logHeaders,
  middleware.loginLimiter,
  middleware.checkBan,
  middleware.validateEmailLogin,
  ldapAuth ? middleware.requireLdapAuth : middleware.requireLocalAuth,
  setBalanceConfig,
  loginController,
);
router.post(
  '/clerk',
  middleware.logHeaders,
  createLoginLimiter(clerkLoginLimiterHandler),
  createCheckBan({ mode: 'ipOnly' }),
  clerkAuthHandlers.validateClerkLoginBody,
  clerkAuthHandlers.prepareClerkLogin,
  createCheckBan({ mode: 'resolvedIdentity' }),
  clerkAuthHandlers.enforceClerkLoginPolicy,
  clerkAuthHandlers.commitClerkLogin,
  setBalanceConfig,
  clerkAuthHandlers.completeClerkLogin,
  clerkAuthHandlers.clerkLoginErrorAdapter,
);
router.post('/refresh', refreshController);
router.post('/cloudfront/refresh', middleware.requireJwtAuth, (req, res) => {
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
});
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
  middleware.resetPasswordSubmissionLimiter,
  middleware.checkBan,
  middleware.validatePasswordReset,
  resetPasswordController,
);

router.post('/2fa/enable', middleware.requireJwtAuth, enable2FA);
router.post('/2fa/verify', middleware.requireJwtAuth, verify2FA);
router.post(
  '/2fa/verify-temp',
  middleware.setTwoFactorTempUser,
  middleware.twoFactorTempLimiter,
  middleware.checkBan,
  verify2FAWithTempToken,
);
router.post('/2fa/confirm', middleware.requireJwtAuth, confirm2FA);
router.post('/2fa/disable', middleware.requireJwtAuth, disable2FA);
router.post('/2fa/backup/regenerate', middleware.requireJwtAuth, regenerateBackupCodes);

router.get('/graph-token', middleware.requireJwtAuth, graphTokenController);

module.exports = router;
