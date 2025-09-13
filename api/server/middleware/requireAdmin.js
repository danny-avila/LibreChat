const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');

/**
 * Middleware to check if authenticated user has admin role
 * Should be used AFTER authentication middleware (requireJwtAuth, requireLocalAuth, etc.)
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    logger.warn('[requireAdmin] No user found in request');
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (!req.user.role || req.user.role !== SystemRoles.ADMIN) {
    logger.debug('[requireAdmin] Access denied for non-admin user:', req.user.email);
    return res.status(403).json({ message: 'Access denied: Admin privileges required' });
  }

  next();
};

module.exports = requireAdmin;
