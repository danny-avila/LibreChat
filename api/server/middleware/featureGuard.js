const FeatureService = require('~/server/services/FeatureService');
const { logger } = require('~/config');

/**
 * Middleware to require a specific feature to be enabled
 * Returns 403 if feature is not available for current business
 *
 * @param {string} featureName - Feature to check (e.g., 'audit', 'social-media')
 * @returns {Function} Express middleware
 *
 * @example
 * router.get('/api/admin/audits',
 *   requireJwtAuth,
 *   requireFeature('audit'),
 *   AuditController.list
 * );
 */
const requireFeature = (featureName) => {
  return (req, res, next) => {
    // Check if feature is enabled for current business
    if (!FeatureService.isFeatureEnabled(featureName)) {
      const businessName = FeatureService.getBusinessName();
      const enabledFeatures = FeatureService.getEnabledFeatures();

      logger.warn(
        `[FeatureGuard] Feature '${featureName}' not available for business '${businessName}'`
      );

      return res.status(403).json({
        error: 'Feature not available',
        message: `The '${featureName}' feature is not enabled for ${businessName} deployment`,
        featureRequested: featureName,
        businessName: businessName,
        enabledFeatures: enabledFeatures,
      });
    }

    // Check if feature has all required environment variables
    const validation = FeatureService.validateFeatureRequirements(featureName);
    if (!validation.valid) {
      logger.error(
        `[FeatureGuard] Feature '${featureName}' is enabled but missing required configuration`,
        { missingVars: validation.missingVars }
      );

      return res.status(500).json({
        error: 'Feature misconfigured',
        message: `The '${featureName}' feature is enabled but not properly configured`,
        featureRequested: featureName,
        missingConfiguration: validation.missingVars,
      });
    }

    // Feature is enabled and properly configured
    next();
  };
};

/**
 * Middleware to validate business configuration
 * Returns 500 if BUSINESS_NAME is invalid
 *
 * Use this middleware early in your route stack to ensure
 * the business configuration is valid before processing requests
 *
 * @example
 * app.use(requireValidBusiness);
 * app.use('/api', routes);
 */
const requireValidBusiness = (req, res, next) => {
  if (!FeatureService.isValidBusiness()) {
    const businessName = FeatureService.getBusinessName();
    const validNames = FeatureService.getValidBusinessNames();

    logger.error(
      `[FeatureGuard] Invalid business name: '${businessName}'`,
      { validOptions: validNames }
    );

    return res.status(500).json({
      error: 'Invalid business configuration',
      message: `Business name '${businessName}' is not recognized`,
      businessName: businessName,
      validOptions: validNames,
      hint: 'Please check your BUSINESS_NAME environment variable',
    });
  }

  next();
};

/**
 * Middleware to add feature configuration to request
 * Adds req.features object with feature information
 *
 * @example
 * app.use(attachFeatureConfig);
 * // Later in your route:
 * if (req.features.isEnabled('audit')) { ... }
 */
const attachFeatureConfig = (req, res, next) => {
  req.features = {
    businessName: FeatureService.getBusinessName(),
    enabledFeatures: FeatureService.getEnabledFeatures(),
    isEnabled: (featureName) => FeatureService.isFeatureEnabled(featureName),
    getConfig: () => FeatureService.getFeatureConfig(),
  };

  next();
};

/**
 * Express error handler for feature-related errors
 * Can be used as a global error handler
 */
const featureErrorHandler = (err, req, res, next) => {
  if (err.code === 'FEATURE_NOT_AVAILABLE') {
    return res.status(403).json({
      error: 'Feature not available',
      message: err.message,
      featureRequested: err.feature,
    });
  }

  if (err.code === 'FEATURE_MISCONFIGURED') {
    return res.status(500).json({
      error: 'Feature misconfigured',
      message: err.message,
      missingConfiguration: err.missingVars,
    });
  }

  // Not a feature error, pass to next error handler
  next(err);
};

module.exports = {
  requireFeature,
  requireValidBusiness,
  attachFeatureConfig,
  featureErrorHandler,
};
