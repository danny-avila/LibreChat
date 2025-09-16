import { Permissions, PermissionBits, PermissionTypes } from 'librechat-data-provider';
import { useHasAccess } from '~/hooks/Roles';

/**
 * Hook to determine the appropriate permission level for agent queries based on marketplace configuration
 */
const useAgentDefaultPermissionLevel = () => {
  const hasMarketplaceAccess = useHasAccess({
    permissionType: PermissionTypes.MARKETPLACE,
    permission: Permissions.USE,
  });

  // When marketplace is active: EDIT permissions (builder mode)
  // When marketplace is not active: VIEW permissions (browse mode)
  return hasMarketplaceAccess ? PermissionBits.EDIT : PermissionBits.VIEW;
};

export default useAgentDefaultPermissionLevel;
