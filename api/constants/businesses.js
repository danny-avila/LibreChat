/**
 * Business Registry
 * Defines all supported businesses and their default features
 *
 * This is the single source of truth for business configurations.
 * Features are automatically loaded based on BUSINESS_NAME environment variable.
 */

const BUSINESSES = {
  SCAFFAD: {
    name: 'scaffad',
    displayName: 'Scaffad',
    defaultFeatures: ['user-management'],
    description: 'Full-featured deployment with audit management',
  },
  JAMOT: {
    name: 'jamot',
    displayName: 'Jamot',
    defaultFeatures: ['social-media', 'financial-analytics', 'audit'],
    description: 'Standard deployment with audit and analytics features',
  },
  GENERIC: {
    name: 'generic',
    displayName: 'Generic',
    defaultFeatures: ['social-media'],
    description: 'Minimal feature set for generic deployments',
  },
};

/**
 * Available features across all businesses
 * Add new features here as they are developed
 */
const AVAILABLE_FEATURES = {
  AUDIT: 'audit',
  SOCIAL_MEDIA: 'social-media',
  USER_MANAGEMENT: 'user-management',
  FINANCIAL_ANALYTICS: 'financial-analytics',
  PROJECT_MANAGEMENT: 'project-management',
  TASK_MANAGEMENT: 'task-management',
};

/**
 * Helper function to get business config by name
 * @param {string} businessName - Business identifier
 * @returns {Object|null} Business configuration or null if not found
 */
const getBusinessByName = (businessName) => {
  return Object.values(BUSINESSES).find((b) => b.name === businessName) || null;
};

/**
 * Helper function to check if business name is valid
 * @param {string} businessName - Business identifier
 * @returns {boolean}
 */
const isValidBusinessName = (businessName) => {
  return Object.values(BUSINESSES).some((b) => b.name === businessName);
};

/**
 * Get all valid business names
 * @returns {string[]}
 */
const getAllBusinessNames = () => {
  return Object.values(BUSINESSES).map((b) => b.name);
};

module.exports = {
  BUSINESSES,
  AVAILABLE_FEATURES,
  getBusinessByName,
  isValidBusinessName,
  getAllBusinessNames,
};
