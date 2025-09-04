const cookies = require('cookie');
const { isEnabled } = require('@librechat/api');
const { getSingleUser } = require('~/server/utils/singleUser');
const passport = require('passport');

// This middleware does not require authentication,
// but if the user is authenticated, it will set the user object.
const optionalJwtAuth = (req, res, next) => {
  // Single-user / no-auth mode: set a default user and continue
  if (isEnabled(process.env.DISABLE_AUTH)) {
    req.user = getSingleUser();
    return next();
  }
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
