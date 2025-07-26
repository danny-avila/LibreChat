const { getSupportedModels, PRICING_DATA } = require('./ModelPricing');
const { logger } = require('~/config');

/**
 * Validates that all models have pricing data configured
 * @returns {Object} Validation result with missing models
 */
function validateModelPricing() {
  const missingPricing = [];
  const warnings = [];
  
  // Get all models that are configured in the system
  // This would need to be extracted from all provider configurations
  const allConfiguredModels = getAllConfiguredModels();
  
  for (const model of allConfiguredModels) {
    if (!PRICING_DATA[model]) {
      missingPricing.push(model);
    } else {
      // Check if pricing is reasonable (not 0 unless experimental)
      const currentPricing = PRICING_DATA[model][0];
      if (currentPricing.prompt === 0 && currentPricing.completion === 0) {
        if (!model.includes('exp')) {
          warnings.push(`${model} has zero pricing but doesn't appear to be experimental`);
        }
      }
    }
  }
  
  return {
    isValid: missingPricing.length === 0,
    missingPricing,
    warnings,
    totalModels: allConfiguredModels.length,
    modelsWithPricing: allConfiguredModels.length - missingPricing.length
  };
}

/**
 * Get all models configured across all providers
 * This would need to be implemented based on actual provider configurations
 */
function getAllConfiguredModels() {
  // This is a placeholder - in a real implementation, this would
  // extract models from all provider configuration files
  const models = new Set();
  
  // Add known models from pricing data
  Object.keys(PRICING_DATA).forEach(model => models.add(model));
  
  return Array.from(models);
}

/**
 * Startup validation that logs warnings for missing pricing
 */
function validateOnStartup() {
  const validation = validateModelPricing();
  
  if (!validation.isValid) {
    logger.warn(`Missing pricing data for ${validation.missingPricing.length} models:`);
    validation.missingPricing.forEach(model => {
      logger.warn(`  - ${model}`);
    });
  }
  
  if (validation.warnings.length > 0) {
    logger.warn('Pricing validation warnings:');
    validation.warnings.forEach(warning => {
      logger.warn(`  - ${warning}`);
    });
  }
  
  logger.info(`Model pricing validation complete: ${validation.modelsWithPricing}/${validation.totalModels} models have pricing data`);
  
  return validation;
}

/**
 * Middleware to check if a model has pricing before allowing usage
 * @param {string} model - Model identifier
 * @returns {boolean} Whether the model has pricing configured
 */
function checkModelHasPricing(model) {
  if (!PRICING_DATA[model]) {
    logger.warn(`Attempted to use model without pricing data: ${model}`);
    return false;
  }
  return true;
}

module.exports = {
  validateModelPricing,
  validateOnStartup,
  checkModelHasPricing
};