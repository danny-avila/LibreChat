const cookies = require('cookie');
const { isEnabled } = require('~/server/utils');
const passport = require('passport');
const { handleForwardedAuth, isForwardedAuthEnabled } = require('~/server/stripe/forwardedAuth');

// This middleware does not require authentication,
// but if the user is authenticated, it will set the user object.
const optionalJwtAuth = (req, res, next) => {
  // <stripe>
  // If forwarded auth is enabled, use ONLY forwarded authentication
  if (isForwardedAuthEnabled()) {
    return handleForwardedAuth(req, res, next, { required: false });
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
