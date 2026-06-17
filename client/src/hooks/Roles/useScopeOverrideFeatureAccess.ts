import { useMemo } from 'react';
import {
  Permissions,
  PermissionTypes,
  PERMISSION_TYPE_INTERFACE_FIELDS,
  SCOPE_OVERRIDE_INTERFACE_FIELDS,
  SCOPE_OVERRIDE_PERMISSION_BITS,
  getInterfacePermissionBit,
} from 'librechat-data-provider';
import type { InterfacePermissionConfig, TInterfaceConfig } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import useHasAccess from './useHasAccess';

type ScopeOverridePermissionType = PermissionTypes.SKILLS | PermissionTypes.PROMPTS;

export default function useScopeOverrideFeatureAccess(
  permissionType: ScopeOverridePermissionType,
  permission: Permissions = Permissions.USE,
): boolean {
  const roleAccess = useHasAccess({ permissionType, permission });
  const { data: startupConfig, isLoading } = useGetStartupConfig();

  return useMemo(() => {
    const field = PERMISSION_TYPE_INTERFACE_FIELDS[permissionType];
    if (!SCOPE_OVERRIDE_INTERFACE_FIELDS.has(field)) {
      return roleAccess;
    }
    if (!SCOPE_OVERRIDE_PERMISSION_BITS.has(permission)) {
      return roleAccess;
    }
    if (isLoading) {
      return false;
    }
    const interfaceConfig = startupConfig?.interface;
    if (!interfaceConfig) {
      return roleAccess;
    }
    const value = interfaceConfig[field as keyof TInterfaceConfig] as InterfacePermissionConfig;
    const configBit = getInterfacePermissionBit(value, permission);
    if (configBit === false) {
      return false;
    }
    if (configBit === true) {
      return true;
    }
    return roleAccess;
  }, [roleAccess, permissionType, permission, startupConfig?.interface, isLoading]);
}
