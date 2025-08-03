import { useMemo } from 'react';
import { PermissionTypes, PrincipalType, Permissions } from 'librechat-data-provider';
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

  const canViewRoles = useHasAccess({
    permissionType: PermissionTypes.PEOPLE_PICKER,
    permission: Permissions.VIEW_ROLES,
  });

  const hasPeoplePickerAccess = canViewUsers || canViewGroups || canViewRoles;

  const peoplePickerTypeFilter:
    | PrincipalType.USER
    | PrincipalType.GROUP
    | PrincipalType.ROLE
    | null = useMemo(() => {
    if (canViewUsers && canViewGroups && canViewRoles) {
      return null; // All types allowed
    } else if (canViewUsers) {
      return PrincipalType.USER;
    } else if (canViewGroups) {
      return PrincipalType.GROUP;
    } else if (canViewRoles) {
      return PrincipalType.ROLE;
    }
    return null;
  }, [canViewUsers, canViewGroups, canViewRoles]);

  return {
    canViewUsers,
    canViewRoles,
    canViewGroups,
    hasPeoplePickerAccess,
    peoplePickerTypeFilter,
  };
};
