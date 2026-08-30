const { logger } = require('@librechat/data-schemas');
const mongoose = require('mongoose');
const {
  createCodeEnvironmentRegistry,
  getAppConfigOptionsFromUser,
  mergeAccessibleCodeEnvironments,
} = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');

const codeEnvironmentRegistry = createCodeEnvironmentRegistry(mongoose);

async function addPrincipalCodeEnvironments(req, appConfig) {
  if (!req.user?.id) return appConfig;
  try {
    return await mergeAccessibleCodeEnvironments({
      appConfig,
      actor: {
        userId: req.user.id,
        role: req.user.role ?? null,
        idOnTheSource: req.user.idOnTheSource ?? null,
      },
      registry: codeEnvironmentRegistry,
    });
  } catch (error) {
    /** Database-backed environments fail closed while deployment-owned YAML
     * environments remain available. */
    logger.warn('[configMiddleware] Failed to load principal code environments', error);
    return appConfig;
  }
}

const configMiddleware = async (req, res, next) => {
  try {
    req.config = await addPrincipalCodeEnvironments(
      req,
      await getAppConfig(getAppConfigOptionsFromUser(req.user)),
    );

    next();
  } catch (error) {
    logger.error('Config middleware error:', {
      error: error.message,
      userRole: req.user?.role,
      path: req.path,
    });

    try {
      req.config = await addPrincipalCodeEnvironments(
        req,
        await getAppConfig({ tenantId: req.user?.tenantId }),
      );
      next();
    } catch (fallbackError) {
      logger.error('Fallback config middleware error:', fallbackError);
      next(fallbackError);
    }
  }
};

module.exports = configMiddleware;
