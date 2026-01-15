const { logger } = require('@librechat/data-schemas');
const Profile = require('~/server/models/Profile');

/**
 * Middleware to check if the authenticated user has a CEO profile
 * Must be used after requireJwtAuth middleware
 */
const requireCEORole = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      logger.warn('[requireCEORole] No authenticated user found');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const userId = req.user.id;
    logger.debug(`[requireCEORole] Checking CEO role for user: ${userId}`);

    // Find user's profile
    const profile = await Profile.findOne({ userId }).lean();

    if (!profile) {
      logger.warn(`[requireCEORole] No profile found for user: ${userId}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Profile not found. Contact administrator.',
      });
    }

    if (profile.profileType !== 'ceo') {
      logger.warn(
        `[requireCEORole] Access denied for user: ${userId}, profile type: ${profile.profileType}`,
      );
      return res.status(403).json({
        error: 'Forbidden',
        message: 'CEO access required. This action is restricted to administrators.',
      });
    }

    logger.debug(`[requireCEORole] CEO access granted for user: ${userId}`);
    
    // Attach profile to request for downstream use
    req.userProfile = profile;
    
    next();
  } catch (error) {
    logger.error('[requireCEORole] Error checking CEO role:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to verify permissions',
    });
  }
};

module.exports = requireCEORole;
