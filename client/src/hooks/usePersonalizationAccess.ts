import { PermissionTypes, Permissions } from 'librechat-data-provider';
import useHasAccess from './Roles/useHasAccess';

export default function usePersonalizationAccess() {
  const hasMemoryOptOut = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.OPT_OUT,
  });

  const hasAnyPersonalizationFeature = hasMemoryOptOut;

  return {
    hasMemoryOptOut,
    hasAnyPersonalizationFeature,
  };
}
