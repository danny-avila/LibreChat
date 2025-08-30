const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');

/**
 * Admin token verification controller
 * Verifies JWT token and returns user data if valid and has admin role
 * Used by admin panel to verify authentication status
 */
const adminVerifyController = async (req, res) => {
  try {
    // User is already authenticated via requireAdminJwtAuth middleware
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Double-check admin role (redundant but ensures security)
    if (!req.user.role || req.user.role !== SystemRoles.ADMIN) {
      logger.warn('[adminVerifyController] Non-admin user attempting to verify:', req.user.email);
      return res.status(403).json({ message: 'Access denied: Admin privileges required' });
    }

    // Return user data without sensitive fields
    const { password: _p, totpSecret: _t, __v, ...user } = req.user;
    user.id = user._id.toString();

    return res.status(200).json({
      valid: true,
      user,
      isAdmin: true,
    });
  } catch (err) {
    logger.error('[adminVerifyController]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  adminVerifyController,
};
