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

  const peoplePickerTypeFilter: Array<
    PrincipalType.USER | PrincipalType.GROUP | PrincipalType.ROLE
  > | null = useMemo(() => {
    const allowedTypes: Array<PrincipalType.USER | PrincipalType.GROUP | PrincipalType.ROLE> = [];

    if (canViewUsers) {
      allowedTypes.push(PrincipalType.USER);
    }
    if (canViewGroups) {
      allowedTypes.push(PrincipalType.GROUP);
    }
    if (canViewRoles) {
      allowedTypes.push(PrincipalType.ROLE);
    }

    // Return null if no types are allowed (will show no results)
    // or if all types are allowed (no filtering needed)
    if (allowedTypes.length === 0 || allowedTypes.length === 3) {
      return null;
    }

    return allowedTypes;
  }, [canViewUsers, canViewGroups, canViewRoles]);

  return {
    canViewUsers,
    canViewRoles,
    canViewGroups,
    hasPeoplePickerAccess,
    peoplePickerTypeFilter,
  };
};
