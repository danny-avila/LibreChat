import { useMemo, useState, useEffect, useCallback } from 'react';
import { SystemRoles, roleDefaults, isSystemRoleName } from 'librechat-data-provider';
import type { PermissionTypes, TRole } from 'librechat-data-provider';
import { useGetRole, useListRoles } from '~/data-provider';
import { useAuthContext } from './AuthContext';

export function useRoleSelector(permissionType: PermissionTypes) {
  const { user, roles } = useAuthContext();
  const [selectedRole, setSelectedRole] = useState<string>(SystemRoles.USER);

  const { data: roleList } = useListRoles({
    enabled: user?.role === SystemRoles.ADMIN,
  });

  const isSelectedCustomRole = !isSystemRoleName(selectedRole);

  const { data: customRoleData = null, isLoading: isCustomRoleLoading } = useGetRole(
    isSelectedCustomRole ? selectedRole : '_',
    { enabled: isSelectedCustomRole },
  );

  const resolvePermissions = useCallback(
    (role: string, customData: TRole | null) => {
      const isCustom = !isSystemRoleName(role);
      if (isCustom && customData?.permissions?.[permissionType]) {
        return customData.permissions[permissionType];
      }
      if (!isCustom && roles?.[role]?.permissions?.[permissionType]) {
        return roles[role]?.permissions[permissionType];
      }
      const defaults = isSystemRoleName(role)
        ? roleDefaults[role as SystemRoles]
        : roleDefaults[SystemRoles.USER];
      return defaults.permissions[permissionType];
    },
    [roles, permissionType],
  );

  const defaultValues = useMemo(
    () => resolvePermissions(selectedRole, customRoleData),
    [resolvePermissions, selectedRole, customRoleData],
  );

  const availableRoleNames = useMemo(() => {
    const names = roleList?.roles?.map((r) => r.name);
    return names?.length ? names : [SystemRoles.USER, SystemRoles.ADMIN];
  }, [roleList]);

  const roleDropdownItems = useMemo(
    () => availableRoleNames.map((role) => ({ label: role, onClick: () => setSelectedRole(role) })),
    [availableRoleNames],
  );

  return {
    roles,
    selectedRole,
    setSelectedRole,
    isSelectedCustomRole,
    customRoleData,
    isCustomRoleLoading,
    defaultValues,
    resolvePermissions,
    availableRoleNames,
    roleDropdownItems,
  };
}
