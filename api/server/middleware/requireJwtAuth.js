const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { logger } = require('@librechat/data-schemas');
const {
  isEnabled,
  tenantContextMiddleware,
  getAuthFailureReason,
  getAuthFailureErrorName,
  buildSafeAuthLogContext,
  formatAuthLogMessage,
  maybeRefreshCloudFrontAuthCookiesMiddleware,
  recordRumProxyRequest,
} = require('@librechat/api');

const hasPassportStrategy = (strategy) =>
  typeof passport._strategy === 'function' && passport._strategy(strategy) != null;

const getValidOpenIdReuseUserId = (parsedCookies) => {
  const openidUserId = parsedCookies.openid_user_id;
  if (!openidUserId || !process.env.JWT_REFRESH_SECRET) {
    return null;
  }

  try {
    const payload = jwt.verify(openidUserId, process.env.JWT_REFRESH_SECRET);
    return typeof payload === 'object' && payload != null && typeof payload.id === 'string'
      ? payload.id
      : null;
  } catch {
    return null;
  }
};

const getAuthenticatedUserId = (user) => user?.id?.toString?.() ?? user?._id?.toString?.();
const refreshCloudFrontCookies =
  maybeRefreshCloudFrontAuthCookiesMiddleware ?? ((_req, _res, next) => next());

const getAuthStrategies = (req) => {
  const cookieHeader = req.headers.cookie;
  const parsedCookies = cookieHeader ? cookies.parse(cookieHeader) : {};
  const tokenProvider = parsedCookies.token_provider;
  const openidReuseEnabled = isEnabled(process.env.OPENID_REUSE_TOKENS);
  const openidJwtAvailable = openidReuseEnabled && hasPassportStrategy('openidJwt');
  const openIdReuseUserId = getValidOpenIdReuseUserId(parsedCookies);
  const useOpenIdJwt =
    tokenProvider === 'openid' && openidJwtAvailable && openIdReuseUserId != null;

  return {
    tokenProvider,
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

/**
 * Custom Middleware to handle JWT authentication, with support for OpenID token reuse.
 * Switches between JWT and OpenID authentication based on cookies and environment settings.
 *
 * After successful authentication (req.user populated), automatically chains into
 * `tenantContextMiddleware` to propagate request context into AsyncLocalStorage
 * for downstream Mongoose tenant isolation and structured logging.
 */
const requireJwtAuth = (req, res, next) => {
  const { tokenProvider, openidReuseEnabled, openidJwtAvailable, openIdReuseUserId, strategies } =
    getAuthStrategies(req);
  const authLogState = {
    tokenProvider,
    openidReuseEnabled,
    openidJwtAvailable,
    hasOpenIdReuseUserId: openIdReuseUserId != null,
  };
  let primaryFailureReason;
  let primaryFailureErrorName;
  let fallbackAttempted = false;

  const logOpenIdFallbackAttempt = ({ fallbackStrategy, reason, errorName, status }) => {
    primaryFailureReason = reason;
    primaryFailureErrorName = errorName;
    fallbackAttempted = true;
    const message = '[requireJwtAuth] OpenID JWT auth failed; trying fallback';
    const context = buildSafeAuthLogContext(req, authLogState, {
      primary_strategy: 'openidJwt',
      fallback_strategy: fallbackStrategy,
      fallback_attempted: true,
      reason,
      error_name: errorName,
      status,
    });
    logger.debug(formatAuthLogMessage(message, context), context);
  };

  const logAuthenticationFailure = ({ strategy, info, status, err }) => {
    const message = '[requireJwtAuth] Authentication failed after all strategies';
    const context = buildSafeAuthLogContext(req, authLogState, {
      primary_strategy: strategies[0],
      fallback_strategy: strategies[1],
      fallback_attempted: fallbackAttempted,
      fallback_succeeded: false,
      attempted_strategies: strategies,
      final_strategy: strategy,
      reason: getAuthFailureReason(err, info),
      error_name: getAuthFailureErrorName(err, info),
      status: status || 401,
    });
    const log = fallbackAttempted ? logger.warn : logger.debug;
    log.call(logger, formatAuthLogMessage(message, context), context);
  };

  const logFallbackSuccess = (strategy) => {
    if (!fallbackAttempted || strategy !== 'jwt') {
      return;
    }
    const message = '[requireJwtAuth] JWT fallback succeeded after OpenID JWT failure';
    const context = buildSafeAuthLogContext(req, authLogState, {
      auth_strategy: 'jwt',
      primary_strategy: 'openidJwt',
      fallback_strategy: 'jwt',
      fallback_attempted: true,
      fallback_succeeded: true,
      primary_failure_reason: primaryFailureReason,
      reason: primaryFailureReason,
      error_name: primaryFailureErrorName,
    });
    logger.debug(formatAuthLogMessage(message, context), context);
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
            reason: getAuthFailureReason(err, info),
            errorName: getAuthFailureErrorName(err, info),
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
            reason: 'openid user-id mismatch',
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
