const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { isEnabled, tenantContextMiddleware } = require('@librechat/api');

const hasPassportStrategy = (strategy) =>
  typeof passport._strategy === 'function' && passport._strategy(strategy) != null;

const hasValidOpenIdReuseCookie = (parsedCookies) => {
  const openidUserId = parsedCookies.openid_user_id;
  if (!openidUserId || !process.env.JWT_REFRESH_SECRET) {
    return false;
  }

  try {
    const payload = jwt.verify(openidUserId, process.env.JWT_REFRESH_SECRET);
    return typeof payload === 'object' && payload != null && typeof payload.id === 'string';
  } catch {
    return false;
  }
};

/**
 * Custom Middleware to handle JWT authentication, with support for OpenID token reuse.
 * Switches between JWT and OpenID authentication based on cookies and environment settings.
 *
 * After successful authentication (req.user populated), automatically chains into
 * `tenantContextMiddleware` to propagate `req.user.tenantId` into AsyncLocalStorage
 * for downstream Mongoose tenant isolation.
 */
const requireJwtAuth = (req, res, next) => {
  const cookieHeader = req.headers.cookie;
  const parsedCookies = cookieHeader ? cookies.parse(cookieHeader) : {};
  const tokenProvider = parsedCookies.token_provider;
  const openidReuseEnabled = isEnabled(process.env.OPENID_REUSE_TOKENS);
  const openidJwtAvailable = openidReuseEnabled && hasPassportStrategy('openidJwt');
  const useOpenIdJwt =
    tokenProvider === 'openid' && openidJwtAvailable && hasValidOpenIdReuseCookie(parsedCookies);
  const strategies = useOpenIdJwt ? ['openidJwt', 'jwt'] : ['jwt'];

  const authenticateWithStrategy = (index) => {
    const strategy = strategies[index];
    passport.authenticate(strategy, { session: false }, (err, user, info, status) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        if (index + 1 < strategies.length) {
          return authenticateWithStrategy(index + 1);
        }
        return res.status(status || 401).json({
          message: info?.message || 'Unauthorized',
        });
      }
      req.user = user;
      req.authStrategy = strategy;
      // req.user is now populated by passport — set up tenant ALS context
      tenantContextMiddleware(req, res, next);
    })(req, res, next);
  };

  authenticateWithStrategy(0);
};

module.exports = requireJwtAuth;
