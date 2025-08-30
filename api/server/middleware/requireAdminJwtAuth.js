const cookies = require('cookie');
const passport = require('passport');
const { isEnabled } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');

/**
 * Custom Middleware to handle JWT authentication for admin endpoints
 * Validates JWT token and ensures user has admin role
 */
const requireAdminJwtAuth = (req, res, next) => {
  // Check if token provider is specified in cookies
  const cookieHeader = req.headers.cookie;
  const tokenProvider = cookieHeader ? cookies.parse(cookieHeader).token_provider : null;

  // Use OpenID authentication if token provider is OpenID and OPENID_REUSE_TOKENS is enabled
  const authStrategy =
    tokenProvider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS) ? 'openidJwt' : 'jwt';

  passport.authenticate(authStrategy, { session: false }, (err, user, _info) => {
    if (err) {
      logger.error('[requireAdminJwtAuth] Authentication error:', err);
      return res.status(500).json({ message: 'Authentication error' });
    }

    if (!user) {
      logger.debug('[requireAdminJwtAuth] No user found');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if user has admin role
    if (!user.role || user.role !== SystemRoles.ADMIN) {
      logger.debug('[requireAdminJwtAuth] User is not an admin:', user.email);
      return res.status(403).json({ message: 'Access denied: Admin privileges required' });
    }

    req.user = user;
    next();
  })(req, res, next);
};

module.exports = requireAdminJwtAuth;
