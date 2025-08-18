const passport = require('passport');
const { logger } = require('~/config');

/**
 * Shared Stripe-specific forwarded authentication logic
 * Handles authentication via forwarded headers when FORWARD_AUTH_ENABLED=true
 */

/**
 * Handles forwarded authentication using Passport's forwardedAuth strategy
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object  
 * @param {Function} next - Express next function
 * @param {Object} options - Authentication options
 * @param {boolean} options.required - Whether authentication is required (true) or optional (false)
 * @returns {void}
 */
const handleForwardedAuth = (req, res, next, options = {}) => {
  const { required = true } = options;

  // If user is already authenticated, proceed
  if (req.user) {
    logger.info(`[Stripe:forwardedAuth] message=User already authenticated user=${req.user.username}
      `);
    return next();
  }

  // Use only Passport's forwardedAuth strategy - no JWT/OpenID
  return passport.authenticate('forwardedAuth', { session: false }, (err, user) => {
    if (err) {
      logger.error(`[Stripe:forwardedAuth] message=Error during user authentication error=${err}`);
      return next(err);
    }

    if (!user) {
      if (required) {
        // Required auth: return 401 error
        return res.status(401).json({ 
          error: 'Authentication required via forwarded headers' 
        });
      } else {
        // Optional auth: continue without user
        return next();
      }
    }

    // Set user and continue
    req.user = user;
    logger.info(`[Stripe:forwardedAuth] message=User authenticated via forwarded headers user=${user.username}`);
    next();
  })(req, res, next);
};

/**
 * Checks if forwarded authentication is enabled
 * @returns {boolean} True if FORWARD_AUTH_ENABLED environment variable is 'true'
 */
const isForwardedAuthEnabled = () => {
  return process.env.FORWARD_AUTH_ENABLED === 'true';
};

module.exports = {
  handleForwardedAuth,
  isForwardedAuthEnabled
};