const { handleForwardedAuth, isForwardedAuthEnabled } = require('~/server/stripe/forwardedAuth');

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
  if (!isForwardedAuthEnabled()) {
    return next();
  }

  // Use shared forwardedAuth logic with optional authentication
  return handleForwardedAuth(req, res, next, { required: false });
};

module.exports = requireForwardedAuth;
