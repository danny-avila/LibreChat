const cookies = require('cookie');
const passport = require('passport');
const { isEnabled } = require('@librechat/api');

const handleAuthenticated = (req, res, next) => (err, user) => {
  if (err) {
    return next(err);
  }
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  if (user.suspended) {
    return res.status(403).json({ message: 'Konto gesperrt. Bitte kontaktiere den Support.' });
  }
  req.user = user;
  next();
};

/**
 * Custom Middleware to handle JWT authentication, with support for OpenID token reuse
 * Switches between JWT and OpenID authentication based on cookies and environment settings
 */
const requireJwtAuth = (req, res, next) => {
  const cookieHeader = req.headers.cookie;
  const tokenProvider = cookieHeader ? cookies.parse(cookieHeader).token_provider : null;

  if (tokenProvider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    return passport.authenticate('openidJwt', { session: false }, handleAuthenticated(req, res, next))(req, res, next);
  }

  return passport.authenticate('jwt', { session: false }, handleAuthenticated(req, res, next))(req, res, next);
};

module.exports = requireJwtAuth;
