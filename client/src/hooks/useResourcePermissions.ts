import {
  useGetEffectivePermissionsQuery,
  hasPermissions,
} from 'librechat-data-provider/react-query';

/**
 * fetches resource permissions once and returns a function to check any permission
 * More efficient when checking multiple permissions for the same resource
 * @param resourceType - Type of resource (e.g., 'agent')
 * @param resourceId - ID of the resource
 * @returns Object with hasPermission function and loading state
 */
export const useResourcePermissions = (resourceType: string, resourceId: string) => {
  const { data, isLoading } = useGetEffectivePermissionsQuery(resourceType, resourceId);

  const hasPermission = (requiredPermission: number): boolean => {
    return data ? hasPermissions(data.permissionBits, requiredPermission) : false;
  };

  return {
    hasPermission,
    isLoading,
    permissionBits: data?.permissionBits || 0,
  };
};
