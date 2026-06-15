import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import useHasAccess from './Roles/useHasAccess';

export default function usePersonalizationAccess() {
  const { data: startupConfig } = useGetStartupConfig();
  const hasMemoryOptOut = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.OPT_OUT,
  });

  const hasLocationSharing = startupConfig?.location?.enabled === true;
  const hasAnyPersonalizationFeature = hasMemoryOptOut || hasLocationSharing;

  return {
    hasMemoryOptOut,
    hasLocationSharing,
    hasAnyPersonalizationFeature,
  };
}
