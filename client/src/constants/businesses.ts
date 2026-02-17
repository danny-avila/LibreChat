/**
 * Business Registry (Frontend)
 * Defines all supported businesses and their metadata
 *
 * This should match the backend constants for consistency
 */

export const BUSINESSES = {
  SCAFFAD: {
    name: 'scaffad',
    displayName: 'Scaffad',
    description: 'Full-featured deployment with audit management',
  },
  JAMOT: {
    name: 'jamot',
    displayName: 'Jamot',
    description: 'Standard deployment with audit and analytics features',
  },
  GENERIC: {
    name: 'generic',
    displayName: 'Generic',
    description: 'Minimal feature set for generic deployments',
  },
} as const;

/**
 * Available features across all businesses
 */
export const FEATURES = {
  AUDIT: 'audit',
  SOCIAL_MEDIA: 'social-media',
  USER_MANAGEMENT: 'user-management',
  FINANCIAL_ANALYTICS: 'financial-analytics',
  PROJECT_MANAGEMENT: 'project-management',
  TASK_MANAGEMENT: 'task-management',
} as const;

// Type exports
export type BusinessName = (typeof BUSINESSES)[keyof typeof BUSINESSES]['name'];
export type BusinessConfig = (typeof BUSINESSES)[keyof typeof BUSINESSES];
export type FeatureName = (typeof FEATURES)[keyof typeof FEATURES];

/**
 * Check if business name is valid
 */
export const isValidBusiness = (name: string): name is BusinessName => {
  return Object.values(BUSINESSES).some((b) => b.name === name);
};

/**
 * Get business config by name
 */
export const getBusinessConfig = (name: string): BusinessConfig | null => {
  return Object.values(BUSINESSES).find((b) => b.name === name) || null;
};

/**
 * Get all valid business names
 */
export const getAllBusinessNames = (): BusinessName[] => {
  return Object.values(BUSINESSES).map((b) => b.name);
};

/**
 * Check if feature name is valid
 */
export const isValidFeature = (name: string): name is FeatureName => {
  return Object.values(FEATURES).includes(name as FeatureName);
};
