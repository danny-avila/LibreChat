const cookies = require('cookie');
const passport = require('passport');
const { isEnabled, tenantContextMiddleware } = require('@librechat/api');

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
  const tokenProvider = cookieHeader ? cookies.parse(cookieHeader).token_provider : null;

  const strategy =
    tokenProvider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS) ? 'openidJwt' : 'jwt';

  passport.authenticate(strategy, { session: false })(req, res, (err) => {
    if (err) {
      return next(err);
    }
    // req.user is now populated by passport — set up tenant ALS context
    tenantContextMiddleware(req, res, next);
  });
};

module.exports = requireJwtAuth;
