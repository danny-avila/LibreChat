import { Permissions, PermissionTypes, SystemRoles } from 'librechat-data-provider';

type PromptRole = {
  permissions?: Partial<Record<PermissionTypes, Partial<Record<Permissions, boolean>>>>;
};

type GetRoleByName = (role: string) => Promise<PromptRole | null | undefined>;

export function createPromptUseChecker(getRoleByName: GetRoleByName) {
  return async ({ role }: { userId: string; role?: string }): Promise<boolean> => {
    if (role === SystemRoles.ADMIN) {
      return true;
    }
    if (!role) {
      return false;
    }
    const roleRecord = await getRoleByName(role);
    return roleRecord?.permissions?.[PermissionTypes.PROMPTS]?.[Permissions.USE] === true;
  };
}
