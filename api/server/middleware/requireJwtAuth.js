const cookies = require('cookie');
const passport = require('passport');
const { isEnabled } = require('@librechat/api');

/**
 * Custom Middleware to handle JWT authentication, with support for OpenID token reuse
 * Switches between JWT and OpenID authentication based on cookies and environment settings
 */
const requireJwtAuth = (req, res, next) => {
  console.log('[requireJwtAuth] Checking authentication for:', req.method, req.path);
  
  // Check if token provider is specified in cookies
  const cookieHeader = req.headers.cookie;
  console.log('[requireJwtAuth] Cookie header:', cookieHeader);
  
  const tokenProvider = cookieHeader ? cookies.parse(cookieHeader).token_provider : null;
  console.log('[requireJwtAuth] Token provider:', tokenProvider);

  // Use OpenID authentication if token provider is OpenID and OPENID_REUSE_TOKENS is enabled
  if (tokenProvider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    console.log('[requireJwtAuth] Using OpenID JWT authentication');
    return passport.authenticate('openidJwt', { session: false })(req, res, next);
  }

  // Default to standard JWT authentication
  console.log('[requireJwtAuth] Using standard JWT authentication');
  return passport.authenticate('jwt', { session: false }, (err, user, info) => {
    console.log('[requireJwtAuth] Passport callback - err:', err, 'user:', user ? user.id : null, 'info:', info);
    if (err) {
      return next(err);
    }
    if (!user) {
      console.log('[requireJwtAuth] Authentication failed - no user found');
      return res.status(401).send('Unauthorized');
    }
    req.user = user;
    console.log('[requireJwtAuth] Authentication successful for user:', user.id);
    next();
  })(req, res, next);
};

module.exports = requireJwtAuth;
