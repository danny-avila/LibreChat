const passport = require('passport');
const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const { isEnabled } = require('~/server/utils');
const { getUserById } = require('~/models');
const { logger } = require('~/config');

/**
 * Custom Middleware to handle JWT authentication, with support for OpenID token reuse and custom backend auth
 * Switches between JWT, OpenID, and custom backend authentication based on cookies and environment settings
 * Also supports token authentication via cookies (for iframe embedding)
 */
const requireJwtAuth = (req, res, next) => {
  // Check if token provider is specified in cookies
  const cookieHeader = req.headers.cookie;
  const tokenProvider = cookieHeader ? cookies.parse(cookieHeader).token_provider : null;
  const authToken = cookieHeader ? cookies.parse(cookieHeader).token : null;

  // Handle token-based authentication from cookies (for iframe embedding)
  if (authToken && !req.headers.authorization) {
    try {
      const decoded = jwt.verify(authToken, process.env.JWT_SECRET);
      if (decoded && decoded.id) {
        // Get user and set req.user
        getUserById(decoded.id, '-password -__v -totpSecret')
          .then(user => {
            if (user) {
              user.id = user._id.toString();
              req.user = user;
              next();
            } else {
              logger.warn('[requireJwtAuth] User not found for token auth:', decoded.id);
              return passport.authenticate('jwt', { session: false })(req, res, next);
            }
          })
          .catch(error => {
            logger.error('[requireJwtAuth] Error fetching user for token auth:', error);
            return passport.authenticate('jwt', { session: false })(req, res, next);
          });
        return;
      }
    } catch (tokenError) {
      logger.debug('[requireJwtAuth] Invalid token in cookie:', tokenError.message);
      // Fall through to normal authentication
    }
  }

  // Use OpenID authentication if token provider is OpenID and OPENID_REUSE_TOKENS is enabled
  if (tokenProvider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    return passport.authenticate('openidJwt', { session: false })(req, res, next);
  }

  // Default to JWT authentication (custom JWT strategy that handles both LibreChat and backend tokens)
  return passport.authenticate('jwt', { session: false })(req, res, next);
};

module.exports = requireJwtAuth;
