const { logger } = require('@librechat/data-schemas');
const { getAppConfigOptionsFromUser, getEffectiveTenantId } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');

const configMiddleware = async (req, res, next) => {
  try {
    req.config = await getAppConfig(
      getAppConfigOptionsFromUser(req.user, getEffectiveTenantId(req)),
    );

    next();
  } catch (error) {
    logger.error('Config middleware error:', {
      error: error.message,
      userRole: req.user?.role,
      path: req.path,
    });

    try {
      req.config = await getAppConfig({ tenantId: getEffectiveTenantId(req) });
      next();
    } catch (fallbackError) {
      logger.error('Fallback config middleware error:', fallbackError);
      next(fallbackError);
    }
  }
};

module.exports = configMiddleware;
