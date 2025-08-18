const passport = require('passport');
const cookies = require('cookie');
const { isEnabled } = require('~/server/utils');
const { handleForwardedAuth, isForwardedAuthEnabled } = require('~/server/stripe/forwardedAuth');

/**
 * Custom Middleware to handle authentication
 * When FORWARD_AUTH_ENABLED=true: Uses ONLY forwarded headers (skips JWT/OpenID entirely)
 * When FORWARD_AUTH_ENABLED=false: Uses JWT/OpenID authentication
 */
const requireJwtAuth = (req, res, next) => {
  // <stripe>
  if (isForwardedAuthEnabled()) {
    return handleForwardedAuth(req, res, next, { required: true });
  }
  // </stripe>
  // Check if token provider is specified in cookies
  const cookieHeader = req.headers.cookie;
  const tokenProvider = cookieHeader ? cookies.parse(cookieHeader).token_provider : null;

  // Use OpenID authentication if token provider is OpenID and OPENID_REUSE_TOKENS is enabled
  if (tokenProvider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    return passport.authenticate('openidJwt', { session: false })(req, res, next);
  }

  // Default to standard JWT authentication
  return passport.authenticate('jwt', { session: false })(req, res, next);
};

module.exports = requireJwtAuth;
