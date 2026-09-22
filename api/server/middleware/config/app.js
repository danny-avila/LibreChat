const { logger } = require('@librechat/data-schemas');
const { getAppConfigOptionsFromUser } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');

const configMiddleware = async (req, res, next) => {
  try {
    req.config = await getAppConfig(getAppConfigOptionsFromUser(req.user));

    next();
  } catch (error) {
    logger.error('Config middleware error:', {
      error: error.message,
      userRole: req.user?.role,
      path: req.path,
    });

    try {
      req.config = await getAppConfig({ tenantId: req.user?.tenantId });
      next();
    } catch (fallbackError) {
      logger.error('Fallback config middleware error:', fallbackError);
      next(fallbackError);
    }
  }
};

/**
 * The same resolution, without the fallback. A route that decides policy from `req.config`
 * must not be handed the base configuration when principal or override resolution fails,
 * because the base can be broader than the scope that should have decided.
 */
const strictConfigMiddleware = async (req, res, next) => {
  try {
    req.config = await getAppConfig({
      ...getAppConfigOptionsFromUser(req.user),
      failClosed: true,
    });
    next();
  } catch (error) {
    logger.error('Strict config middleware error:', {
      error: error.message,
      userRole: req.user?.role,
      path: req.path,
    });
    next(error);
  }
};

module.exports = configMiddleware;
module.exports.strictConfigMiddleware = strictConfigMiddleware;
