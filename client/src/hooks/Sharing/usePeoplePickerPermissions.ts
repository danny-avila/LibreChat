import { useMemo } from 'react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useHasAccess } from '~/hooks';

/**
 * Hook to check people picker permissions and return the appropriate type filter
 * @returns Object with permission states and type filter
 */
export const usePeoplePickerPermissions = () => {
  const canViewUsers = useHasAccess({
    permissionType: PermissionTypes.PEOPLE_PICKER,
    permission: Permissions.VIEW_USERS,
  });

  const canViewGroups = useHasAccess({
    permissionType: PermissionTypes.PEOPLE_PICKER,
    permission: Permissions.VIEW_GROUPS,
  });

  const hasPeoplePickerAccess = canViewUsers || canViewGroups;

  const peoplePickerTypeFilter = useMemo(() => {
    if (canViewUsers && canViewGroups) {
      return null; // Both types allowed
    } else if (canViewUsers) {
      return 'user' as const;
    } else if (canViewGroups) {
      return 'group' as const;
    }
    return null;
  }, [canViewUsers, canViewGroups]);

  return {
    canViewUsers,
    canViewGroups,
    hasPeoplePickerAccess,
    peoplePickerTypeFilter,
  };
};
