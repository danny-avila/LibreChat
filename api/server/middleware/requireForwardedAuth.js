const passport = require('passport');
const { logger } = require('~/config');

/**
 * Middleware that attempts to authenticate using forwarded HTTP headers
 * Silently continues to the next middleware if authentication fails
 * Sets req.user on success
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requireForwardedAuth = (req, res, next) => {
  // Skip if forward auth is not enabled
  if (process.env.FORWARD_AUTH_ENABLED !== 'true') {
    return next();
  }

  // Authenticate using the forwardedAuth strategy
  passport.authenticate('forwardedAuth', { session: false }, async (err, user) => {
    if (err) {
      logger.error('[requireForwardedAuth] Error during authentication:', err);
      return next(err);
    }

    if (!user) {
      // No user found, continue to next middleware
      return next();
    }

    // Set the authenticated user in the request
    req.user = user;

    logger.debug(`[requireForwardedAuth] User ${user.username}
      authenticated via forwarded headers`);
    next();
  })(req, res, next);
};

module.exports = requireForwardedAuth;
