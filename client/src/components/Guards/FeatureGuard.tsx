import React from 'react';
import { Navigate } from 'react-router-dom';
import { useFeatureFlag } from '~/hooks/useFeatureFlag';
import type { FeatureName } from '~/constants/businesses';

interface FeatureGuardProps {
  feature: FeatureName;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectTo?: string;
  showError?: boolean;
}

/**
 * Guard component to protect routes/components based on feature flags
 *
 * Checks if a feature is enabled for the current business deployment.
 * If disabled, can redirect, show fallback, or show error message.
 *
 * @example
 * // In routes
 * <Route
 *   path="/ceo-dashboard/audit"
 *   element={
 *     <FeatureGuard feature="audit">
 *       <AuditPage />
 *     </FeatureGuard>
 *   }
 * />
 *
 * @example
 * // With custom fallback
 * <FeatureGuard
 *   feature="audit"
 *   fallback={<div>Feature not available</div>}
 * >
 *   <AuditButton />
 * </FeatureGuard>
 */
export const FeatureGuard: React.FC<FeatureGuardProps> = ({
  feature,
  children,
  fallback = null,
  redirectTo = '/ceo-dashboard',
  showError = false,
}) => {
  const { isEnabled, isLoading, error, businessDisplayName } = useFeatureFlag(feature);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-gray-900 dark:border-gray-100" />
      </div>
    );
  }

  // Error state
  if (error && showError) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold text-red-600 dark:text-red-400">
            Failed to Load Configuration
          </h2>
          <p className="text-gray-600 dark:text-gray-400">{error.message}</p>
        </div>
      </div>
    );
  }

  // Feature not enabled - redirect or show fallback
  if (!isEnabled) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (showError) {
      return (
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
              Feature Not Available
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              The '{feature}' feature is not enabled for {businessDisplayName} deployment.
            </p>
          </div>
        </div>
      );
    }

    return <Navigate to={redirectTo} replace />;
  }

  // Feature enabled - render children
  return <>{children}</>;
};

/**
 * HOC version of FeatureGuard
 *
 * @example
 * export default withFeatureGuard(AuditPage, 'audit');
 */
export const withFeatureGuard = (
  Component: React.ComponentType<any>,
  feature: FeatureName,
  options?: Omit<FeatureGuardProps, 'feature' | 'children'>,
) => {
  return (props: any) => (
    <FeatureGuard feature={feature} {...options}>
      <Component {...props} />
    </FeatureGuard>
  );
};
