const { checkTimeWindowAccess } = require('~/server/services/TimeWindowService');
const { logger } = require('@librechat/data-schemas');

/**
 * Middleware to validate if user is within their allowed time windows for sending prompts
 * @param {Object} options - Configuration options
 * @param {boolean} options.defaultAllowWhenNoGroups - Whether to allow access when user has no groups (default: false)
 * @param {boolean} options.defaultAllowWhenNoTimeWindows - Whether to allow access when groups have no time windows (default: true)
 * @returns {Function} Express middleware function
 */
const createTimeWindowValidator = (options = {}) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        // This should not happen as requireJwtAuth runs before this middleware
        return res.status(401).json({ 
          error: 'Authentication required',
          type: 'auth_required'
        });
      }

      // Check if user has access based on time windows with configuration
      const accessCheck = await checkTimeWindowAccess(userId, options);
    
      if (!accessCheck || !accessCheck.isAllowed) {
        logger.warn(`[validateTimeWindows] Access denied for user ${userId}: ${accessCheck?.message || 'Service returned null/undefined'}`);
        
        return res.status(403).json({
          error: 'Time Window Restriction',
          message: accessCheck?.message || 'You are currently outside your allowed time windows.',
          type: 'time_window_restriction',
          nextAllowedTime: accessCheck?.nextAllowedTime,
          details: {
            code: 'OUTSIDE_TIME_WINDOW',
            canRetryAt: accessCheck?.nextAllowedTime,
          }
        });
      }

      // Access allowed, continue to next middleware
      next();
      
    } catch (error) {
      logger.error('[validateTimeWindows] Error in time window validation middleware:', error);
      
      // On error, allow access to prevent service disruption but log the error
      next();
    }
  };
};

// Default middleware with backwards compatibility - uses new secure defaults
const validateTimeWindows = createTimeWindowValidator({
  defaultAllowWhenNoGroups: true,         // Allow access when user has no groups (for backwards compatibility)
  defaultAllowWhenNoTimeWindows: true     // Keep existing behavior for groups without time windows
});

module.exports = validateTimeWindows;
module.exports.createTimeWindowValidator = createTimeWindowValidator;