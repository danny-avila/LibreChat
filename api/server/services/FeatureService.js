const {
  BUSINESSES,
  AVAILABLE_FEATURES,
  getBusinessByName,
  isValidBusinessName,
  getAllBusinessNames
} = require('~/constants/businesses');
const { logger } = require('~/config');

/**
 * Feature Service
 * Manages feature flags based on business configuration constants
 *
 * Features are determined by BUSINESS_NAME environment variable
 * which maps to business configurations in constants/businesses.js
 */
class FeatureService {
  /**
   * Get business name from environment
   * @returns {string} Business name (defaults to 'jamot')
   */
  static getBusinessName() {
    return process.env.BUSINESS_NAME || 'jamot';
  }

  /**
   * Get business configuration from constants
   * @returns {Object|null} Business configuration or null if not found
   */
  static getBusinessConfig() {
    const businessName = this.getBusinessName();
    return getBusinessByName(businessName);
  }

  /**
   * Get enabled features from business constants
   * Features are automatically determined by BUSINESS_NAME
   * @returns {string[]} Array of enabled feature names
   */
  static getEnabledFeatures() {
    const businessConfig = this.getBusinessConfig();
    return businessConfig?.defaultFeatures || [];
  }

  /**
   * Check if a feature is enabled for current business
   * @param {string} featureName - Feature to check (e.g., 'audit', 'social-media')
   * @returns {boolean} True if feature is enabled
   */
  static isFeatureEnabled(featureName) {
    const enabledFeatures = this.getEnabledFeatures();
    return enabledFeatures.includes(featureName);
  }

  /**
   * Validate business name against registry
   * @returns {boolean} True if BUSINESS_NAME is valid
   */
  static isValidBusiness() {
    const businessName = this.getBusinessName();
    return isValidBusinessName(businessName);
  }

  /**
   * Get full feature configuration for client
   * @returns {Object} Complete feature configuration
   */
  static getFeatureConfig() {
    const businessConfig = this.getBusinessConfig();
    const businessName = this.getBusinessName();

    return {
      businessName,
      businessDisplayName: businessConfig?.displayName || 'Unknown',
      enabledFeatures: this.getEnabledFeatures(),
      availableFeatures: Object.values(AVAILABLE_FEATURES),
      isValidBusiness: this.isValidBusiness(),
      description: businessConfig?.description || '',
    };
  }

  /**
   * Check if routes should be loaded for a feature
   * Used during server initialization for conditional route loading
   * @param {string} featureName - Feature to check
   * @returns {boolean} True if routes should be loaded
   */
  static shouldLoadRoutes(featureName) {
    if (!this.isValidBusiness()) {
      logger.warn(`[FeatureService] Invalid business name: ${this.getBusinessName()}`);
      return false;
    }
    return this.isFeatureEnabled(featureName);
  }

  /**
   * Get all available businesses
   * @returns {Object[]} Array of business configurations
   */
  static getAllBusinesses() {
    return Object.values(BUSINESSES);
  }

  /**
   * Get all valid business names
   * @returns {string[]} Array of business names
   */
  static getValidBusinessNames() {
    return getAllBusinessNames();
  }

  /**
   * Log feature configuration on startup
   * Displays current business and enabled features
   */
  static logStartupConfig() {
    const config = this.getFeatureConfig();

    console.log('\n' + '='.repeat(50));
    console.log('Feature Configuration');
    console.log('='.repeat(50));
    console.log(`Business: ${config.businessDisplayName} (${config.businessName})`);
    console.log(`Enabled Features: ${config.enabledFeatures.join(', ') || 'none'}`);
    console.log(`Valid Business: ${config.isValidBusiness ? '✓ Yes' : '✗ No'}`);

    if (!config.isValidBusiness) {
      console.warn('\n⚠️  WARNING: Invalid business name!');
      console.warn(`   Current BUSINESS_NAME: "${config.businessName}"`);
      console.warn(`   Valid options: ${this.getValidBusinessNames().join(', ')}`);
      console.warn('   Please update BUSINESS_NAME in your .env file\n');
    }

    console.log('='.repeat(50) + '\n');
  }

  /**
   * Validate feature name
   * @param {string} featureName - Feature to validate
   * @returns {boolean} True if feature name is valid
   */
  static isValidFeature(featureName) {
    return Object.values(AVAILABLE_FEATURES).includes(featureName);
  }

  /**
   * Get feature requirements (e.g., which env vars needed)
   * @param {string} featureName - Feature to check
   * @returns {Object} Feature requirements
   */
  static getFeatureRequirements(featureName) {
    const requirements = {
      audit: {
        envVars: ['AUDIT_ADMIN_API_URL', 'ADMIN_API_SECRET'],
        description: 'Requires external Audit Platform API configuration',
      },
      'social-media': {
        envVars: [],
        description: 'Social media automation features',
      },
      'user-management': {
        envVars: [],
        description: 'Advanced user management features',
      },
      'financial-analytics': {
        envVars: [],
        description: 'Financial analytics and reporting',
      },
    };

    return requirements[featureName] || { envVars: [], description: 'No additional requirements' };
  }

  /**
   * Check if all required environment variables are set for a feature
   * @param {string} featureName - Feature to check
   * @returns {Object} Validation result with missing vars
   */
  static validateFeatureRequirements(featureName) {
    const requirements = this.getFeatureRequirements(featureName);
    const missingVars = requirements.envVars.filter((varName) => !process.env[varName]);

    return {
      valid: missingVars.length === 0,
      missingVars,
      requirements,
    };
  }
}

module.exports = FeatureService;
