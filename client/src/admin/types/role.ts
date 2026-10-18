import type { PermissionTypes, TRole } from 'librechat-data-provider';

export type RolePermissions = {
  [K in PermissionTypes]: Record<string, boolean>;
};

export interface Role extends Omit<TRole, 'permissions'> {
  id: string;
  description: string;
  isSystemRole: boolean;
  isActive: boolean;
  userCount: number;
  permissions: RolePermissions;
}
