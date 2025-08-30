const passport = require('passport');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');

/**
 * Middleware for admin authentication using local strategy
 * Validates credentials and ensures user has admin role
 */
const requireAdminAuth = (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      logger.error('[requireAdminAuth] Error at passport.authenticate:', err);
      return next(err);
    }
    if (!user) {
      logger.debug('[requireAdminAuth] Error: No user');
      return res.status(404).send(info);
    }
    if (info && info.message) {
      logger.debug('[requireAdminAuth] Error: ' + info.message);
      return res.status(422).send({ message: info.message });
    }

    // Check if user has admin role
    if (!user.role || user.role !== SystemRoles.ADMIN) {
      logger.debug('[requireAdminAuth] Error: User is not an admin');
      return res.status(403).send({ message: 'Access denied: Admin privileges required' });
    }

    req.user = user;
    next();
  })(req, res, next);
};

module.exports = requireAdminAuth;
