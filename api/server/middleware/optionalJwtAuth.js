const cookies = require('cookie');
const { isEnabled } = require('~/server/utils');
const passport = require('passport');

// This middleware does not require authentication,
// but if the user is authenticated, it will set the user object.
const optionalJwtAuth = (req, res, next) => {
  // <stripe>
  // If forwarded auth is enabled, use ONLY forwarded authentication
  if (process.env.FORWARD_AUTH_ENABLED === 'true') {
    // Use only Passport's forwardedAuth strategy - no JWT/OpenID
    return passport.authenticate('forwardedAuth', { session: false }, (err, user) => {
      if (err) {
        return next(err);
      }
      
      if (user) {
        req.user = user;
      }
      
      // Continue regardless of result (this is optional auth)
      next();
    })(req, res, next);
  }

  // Forwarded auth is disabled - use JWT/OpenID authentication
  // </stripe>
  const cookieHeader = req.headers.cookie;
  const tokenProvider = cookieHeader ? cookies.parse(cookieHeader).token_provider : null;
  const callback = (err, user) => {
    if (err) {
      return next(err);
    }
    if (user) {
      req.user = user;
    }
    next();
  };
  if (tokenProvider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    return passport.authenticate('openidJwt', { session: false }, callback)(req, res, next);
  }
  passport.authenticate('jwt', { session: false }, callback)(req, res, next);
};

module.exports = optionalJwtAuth;
