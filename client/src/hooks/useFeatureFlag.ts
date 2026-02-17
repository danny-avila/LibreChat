import { useMemo } from 'react';
import { useGetStartupConfig } from '~/data-provider';
import type { FeatureName } from '~/constants/businesses';

interface FeatureFlagResult {
  isEnabled: boolean;
  businessName: string;
  businessDisplayName: string;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to check if a feature is enabled for current business
 *
 * Features are determined by BUSINESS_NAME environment variable on backend
 * which maps to business configurations in constants
 *
 * @param featureName - Feature to check (e.g., 'audit', 'social-media')
 * @returns Feature flag result with loading/error states
 *
 * @example
 * const { isEnabled, businessName, isLoading } = useFeatureFlag('audit');
 *
 * if (isLoading) return <Spinner />;
 * if (!isEnabled) return <Navigate to="/dashboard" />;
 * return <AuditPage />;
 */
export const useFeatureFlag = (featureName: FeatureName): FeatureFlagResult => {
  const { data: config, isLoading, error } = useGetStartupConfig();

  const result = useMemo(() => {
    const enabledFeatures = (config?.enabledFeatures as string[]) || [];
    const isEnabled = enabledFeatures.includes(featureName);
    const businessName = (config?.businessName as string) || 'unknown';
    const businessDisplayName = (config?.businessDisplayName as string) || 'Unknown';

    return {
      isEnabled,
      businessName,
      businessDisplayName,
    };
  }, [config, featureName]);

  return {
    ...result,
    isLoading,
    error: error as Error | null,
  };
};

/**
 * Hook to get all enabled features
 *
 * @returns All enabled features for current business
 *
 * @example
 * const { enabledFeatures, businessName } = useEnabledFeatures();
 * console.log('Business:', businessName);
 * console.log('Features:', enabledFeatures);
 */
export const useEnabledFeatures = () => {
  const { data: config, isLoading, error } = useGetStartupConfig();

  const result = useMemo(() => {
    return {
      enabledFeatures: (config?.enabledFeatures as string[]) || [],
      businessName: (config?.businessName as string) || 'unknown',
      businessDisplayName: (config?.businessDisplayName as string) || 'Unknown',
    };
  }, [config]);

  return {
    ...result,
    isLoading,
    error: error as Error | null,
  };
};

/**
 * Hook to check multiple features at once
 *
 * @param featureNames - Array of features to check
 * @returns Object with feature name as key and boolean as value
 *
 * @example
 * const features = useFeatureFlags(['audit', 'social-media']);
 * if (features.audit) {
 *   // Show audit link
 * }
 */
export const useFeatureFlags = (featureNames: FeatureName[]) => {
  const { data: config, isLoading, error } = useGetStartupConfig();

  const features = useMemo(() => {
    const enabledFeatures = (config?.enabledFeatures as string[]) || [];

    return featureNames.reduce(
      (acc, featureName) => {
        acc[featureName] = enabledFeatures.includes(featureName);
        return acc;
      },
      {} as Record<FeatureName, boolean>,
    );
  }, [config, featureNames]);

  return {
    features,
    isLoading,
    error: error as Error | null,
  };
};
