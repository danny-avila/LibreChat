import { Permissions, PermissionTypes, SystemRoles } from 'librechat-data-provider';
import type { CheckAccessParams, RequestRoleCache } from '../../middleware/access';
import { getRoleForAccess } from '../../middleware/access';

export function createPromptUseChecker(getRoleByName: CheckAccessParams['getRoleByName']) {
  return async ({
    role,
    roleCache,
  }: {
    userId: string;
    role?: string;
    roleCache?: RequestRoleCache;
  }): Promise<boolean> => {
    if (role === SystemRoles.ADMIN) {
      return true;
    }
    if (!role) {
      return false;
    }
    const roleRecord = await getRoleForAccess({
      roleName: role,
      roleCache,
      getRoleByName,
    });
    return roleRecord?.permissions?.[PermissionTypes.PROMPTS]?.[Permissions.USE] === true;
  };
}
