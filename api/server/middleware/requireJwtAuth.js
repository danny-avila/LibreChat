const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { logger } = require('@librechat/data-schemas');
const { TWO_FACTOR_ENROLLMENT_REQUIRED_CODE } = require('librechat-data-provider');
const {
  isEnabled,
  isTokenRetired,
  clearCloudFrontCookies,
  tenantContextMiddleware,
  getAuthFailureReasonCategory,
  buildSafeAuthLogContext,
  maybeRefreshCloudFrontAuthCookiesMiddleware,
  recordRumProxyRequest,
  getValidOpenIdReuseUserId,
  generateTwoFactorSetupToken,
  isTwoFactorEnrollmentRequired,
  TOKEN_RETIREMENT_FIELDS,
} = require('@librechat/api');
const { getUserById } = require('~/models');

const hasPassportStrategy = (strategy) =>
  typeof passport._strategy === 'function' && passport._strategy(strategy) != null;

const getAuthenticatedUserId = (user) => user?.id?.toString?.() ?? user?._id?.toString?.();
const refreshCloudFrontCookies =
  maybeRefreshCloudFrontAuthCookiesMiddleware ?? ((_req, _res, next) => next());

const getAuthTokenSource = (req) => {
  const authorization = req.headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  return typeof value === 'string' && /^Bearer\s+/i.test(value) ? 'bearer' : 'none';
};

const getAuthStrategies = (req) => {
  const cookieHeader = req.headers.cookie;
  const parsedCookies = cookieHeader ? cookies.parse(cookieHeader) : {};
  const tokenProvider = parsedCookies.token_provider;
  const openidReuseEnabled = isEnabled(process.env.OPENID_REUSE_TOKENS);
  const openidJwtAvailable = openidReuseEnabled && hasPassportStrategy('openidJwt');
  const openIdReuseUserId = getValidOpenIdReuseUserId(parsedCookies.openid_user_id);
  const useOpenIdJwt =
    tokenProvider === 'openid' && openidJwtAvailable && openIdReuseUserId != null;

  return {
    tokenProvider,
    tokenSource: getAuthTokenSource(req),
    openidReuseEnabled,
    openidJwtAvailable,
    openIdReuseUserId,
    strategies: useOpenIdJwt ? ['openidJwt', 'jwt'] : ['jwt'],
  };
};

const dropRumTelemetry = (res) => {
  if (!res.headersSent) {
    res.status(204).end();
  }
};

// Keep in sync with packages/api/src/rum/proxy.ts; auth drops are recorded before proxy code runs.
const getRumProxyEndpoint = (req) => {
  if (req.path === '/v1/traces') {
    return 'traces';
  }
  if (req.path === '/v1/logs') {
    return 'logs';
  }
  return 'unknown';
};

const isOpenIdReuseUser = (strategy, user, openIdReuseUserId) =>
  strategy !== 'openidJwt' || getAuthenticatedUserId(user) === openIdReuseUserId;

/** Express routes non-strictly and case-insensitively by default, so `/api/auth/logout/` and
 * `/API/AUTH/LOGOUT` both reach the logout handler. Normalize the same way before allowlisting. */
const normalizeRouteSegment = (value) =>
  typeof value === 'string' ? value.toLowerCase().replace(/\/+$/, '') : '';

const isTwoFactorPolicyAllowlisted = (req) =>
  req.method === 'POST' &&
  normalizeRouteSegment(req.baseUrl) === '/api/auth' &&
  normalizeRouteSegment(req.path) === '/logout';

/**
 * The bearer that authorized this request, dated the way `isTokenRetired` dates credentials.
 *
 * Passport verified this token's signature before the request reached here, so reading its claims
 * again only re-reads what has already been trusted. Both strategies extract the same
 * `Authorization` header, so this is the authorizing credential whichever one answered, and a
 * bearer that cannot be dated at all is refused by `isTokenRetired` once either cutoff is set.
 */
const getAuthorizingCredential = (req) => {
  const authorization = req.headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  const token = typeof value === 'string' ? value.replace(/^Bearer\s+/i, '') : '';
  const payload = token ? jwt.decode(token) : null;
  return { issuedAt: payload?.iat, issuedAtMs: payload?.issuedAtMs };
};

/**
 * Rechecks the bearer that authorized this request against a read taken after the setup token
 * was minted.
 *
 * The strategy dates the bearer against a document it read beforehand, so recovery landing between
 * that read and the mint leaves a setup token stamped past `passwordResetAt`, which
 * `blockRetiredSetupToken` has nothing to retire it by. `/2fa/setup` onward is authorized by that
 * token and the nonces it earns, never by the bearer, so the holder of the revoked credential
 * could otherwise stage and promote a secret of their own over the recovered account. Reading the
 * cutoff after the mint is what orders the two: a reset later than this read is later than the
 * mint as well, and the ordinary retirement gates take it from there.
 */
const isAuthorizingCredentialRetired = async (userId, credential) => {
  const retirement = await getUserById(userId, TOKEN_RETIREMENT_FIELDS);
  return isTokenRetired(credential, retirement);
};

const isTwoFactorPolicyEnforced = (req) =>
  isTwoFactorEnrollmentRequired(req.user) && !isTwoFactorPolicyAllowlisted(req);

const enforceTwoFactorPolicy = async (req, res) => {
  const userId = getAuthenticatedUserId(req.user);
  clearCloudFrontCookies(res, {
    userId,
    tenantId: req.user?.tenantId ?? req.user?.orgId,
    storageRegion: req.user?.storageRegion,
  });

  const tempToken = generateTwoFactorSetupToken(userId, process.env.JWT_SECRET);
  /** The setup token outranks the bearer that bought it, so it is dated the same way. */
  if (await isAuthorizingCredentialRetired(userId, getAuthorizingCredential(req))) {
    logger.warn(
      `[requireJwtAuth] Password was reset while the request was in flight: userId=${userId}`,
    );
    return res.status(401).json({ message: 'Unauthorized' });
  }

  return res.status(403).json({
    code: TWO_FACTOR_ENROLLMENT_REQUIRED_CODE,
    twoFAPending: true,
    twoFASetupRequired: true,
    tempToken,
  });
};

/**
 * Custom Middleware to handle JWT authentication, with support for OpenID token reuse.
 * Switches between JWT and OpenID authentication based on cookies and environment settings.
 *
 * After successful authentication (req.user populated), automatically chains into
 * `tenantContextMiddleware` to propagate request context into AsyncLocalStorage
 * for downstream Mongoose tenant isolation and structured logging.
 */
const requireJwtAuth = (req, res, next) => {
  const {
    tokenProvider,
    tokenSource,
    openidReuseEnabled,
    openidJwtAvailable,
    openIdReuseUserId,
    strategies,
  } = getAuthStrategies(req);
  const authLogState = {
    tokenProvider,
    tokenSource,
    openidReuseEnabled,
    openidJwtAvailable,
    hasOpenIdReuseUserId: openIdReuseUserId != null,
  };
  let primaryFailureReasonCategory;
  let fallbackAttempted = false;

  const logOpenIdFallbackAttempt = ({ fallbackStrategy, reasonCategory, status }) => {
    primaryFailureReasonCategory = reasonCategory;
    fallbackAttempted = true;
    const message = '[requireJwtAuth] OpenID JWT auth failed; trying fallback';
    const context = buildSafeAuthLogContext(req, authLogState, {
      event_name: 'jwt_auth_fallback_attempt',
      primary_strategy: 'openidJwt',
      fallback_strategy: fallbackStrategy,
      fallback_attempted: true,
      reason_category: reasonCategory,
      recovery_classification: 'fallback_attempted',
      strategy_status: status,
    });
    logger.debug({ message, ...context });
  };

  const logAuthenticationFailure = ({ strategy, info, status, err }) => {
    const message = '[requireJwtAuth] Authentication failed after all strategies';
    const reasonCategory = getAuthFailureReasonCategory(err, info);
    const context = buildSafeAuthLogContext(req, authLogState, {
      event_name: 'jwt_auth_rejected',
      primary_strategy: strategies[0],
      fallback_strategy: strategies[1],
      fallback_attempted: fallbackAttempted,
      fallback_succeeded: false,
      attempted_strategies: strategies,
      final_strategy: strategy,
      ...(fallbackAttempted && {
        primary_failure_reason_category: primaryFailureReasonCategory,
      }),
      reason_category: reasonCategory,
      recovery_classification: 'terminal_rejection',
      response_status: status || 401,
    });
    const log =
      fallbackAttempted || reasonCategory === 'malformed_jwt' ? logger.warn : logger.debug;
    log.call(logger, { message, ...context });
  };

  const logFallbackSuccess = (strategy) => {
    if (!fallbackAttempted || strategy !== 'jwt') {
      return;
    }
    const message = '[requireJwtAuth] JWT fallback succeeded after OpenID JWT failure';
    const context = buildSafeAuthLogContext(req, authLogState, {
      event_name: 'jwt_auth_recovered',
      auth_strategy: 'jwt',
      primary_strategy: 'openidJwt',
      fallback_strategy: 'jwt',
      fallback_attempted: true,
      fallback_succeeded: true,
      primary_failure_reason_category: primaryFailureReasonCategory,
      recovery_classification: 'fallback_succeeded',
    });
    logger.debug({ message, ...context });
  };

  const authenticateWithStrategy = (index) => {
    const strategy = strategies[index];
    passport.authenticate(strategy, { session: false }, (err, user, info, status) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        if (index + 1 < strategies.length) {
          logOpenIdFallbackAttempt({
            fallbackStrategy: strategies[index + 1],
            reasonCategory: getAuthFailureReasonCategory(err, info),
            status: status || 401,
          });
          return authenticateWithStrategy(index + 1);
        }
        logAuthenticationFailure({ strategy, info, status, err });
        return res.status(status || 401).json({
          message: info?.message || 'Unauthorized',
        });
      }
      if (strategy === 'openidJwt' && getAuthenticatedUserId(user) !== openIdReuseUserId) {
        if (index + 1 < strategies.length) {
          logOpenIdFallbackAttempt({
            fallbackStrategy: strategies[index + 1],
            reasonCategory: 'principal_mismatch',
            status: 401,
          });
          return authenticateWithStrategy(index + 1);
        }
        logAuthenticationFailure({ strategy, info, status: 401, err });
        return res.status(401).json({ message: 'Unauthorized' });
      }
      req.user = user;
      req.authStrategy = strategy;
      logFallbackSuccess(strategy);
      /** Only the blocked path re-reads the cutoff, so an allowed request stays synchronous. */
      if (isTwoFactorPolicyEnforced(req)) {
        return enforceTwoFactorPolicy(req, res).catch(next);
      }
      tenantContextMiddleware(req, res, (tenantErr) => {
        if (tenantErr) {
          return next(tenantErr);
        }
        refreshCloudFrontCookies(req, res, next);
      });
    })(req, res, next);
  };

  authenticateWithStrategy(0);
};

const requireRumProxyAuth = (req, res, next) => {
  const { openIdReuseUserId, strategies } = getAuthStrategies(req);
  const endpoint = getRumProxyEndpoint(req);
  let authErrorSeen = false;

  const dropTelemetry = () => {
    recordRumProxyRequest(endpoint, authErrorSeen ? 'auth_error' : 'auth_drop');
    dropRumTelemetry(res);
  };

  const finishAuthentication = (strategy, user) => {
    req.user = user;
    req.authStrategy = strategy;
    next();
  };

  let nextStrategyIndex = 0;
  const tryNextStrategy = () => {
    const strategy = strategies[nextStrategyIndex];
    nextStrategyIndex += 1;

    if (!strategy) {
      dropTelemetry();
      return;
    }

    passport.authenticate(strategy, { session: false }, (err, user) => {
      authErrorSeen = authErrorSeen || err != null;
      if (err || !user || !isOpenIdReuseUser(strategy, user, openIdReuseUserId)) {
        tryNextStrategy();
        return;
      }

      finishAuthentication(strategy, user);
    })(req, res, next);
  };

  tryNextStrategy();
};

module.exports = requireJwtAuth;
module.exports.requireRumProxyAuth = requireRumProxyAuth;
