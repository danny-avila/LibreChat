const passport = require('passport');
const {
  tenantContextMiddleware,
  maybeRefreshCloudFrontAuthCookiesMiddleware,
} = require('@librechat/api');

const refreshCloudFrontCookies =
  maybeRefreshCloudFrontAuthCookiesMiddleware ?? ((_req, _res, next) => next());

/**
 * Custom Middleware to handle JWT authentication.
 *
 * After successful authentication (req.user populated), automatically chains into
 * `tenantContextMiddleware` to propagate request context into AsyncLocalStorage
 * for downstream Mongoose tenant isolation and structured logging.
 */
const requireJwtAuth = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info, status) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.status(status || 401).json({
        message: info?.message || 'Unauthorized',
      });
    }
    req.user = user;
    req.authStrategy = 'jwt';
    tenantContextMiddleware(req, res, (tenantErr) => {
      if (tenantErr) {
        return next(tenantErr);
      }
      refreshCloudFrontCookies(req, res, next);
    });
  })(req, res, next);
};

module.exports = requireJwtAuth;
