import type { AdminGroup } from 'librechat-data-provider';
import type { Role, RolePermissions } from './role';

export interface AccessPageProps {
  activeTab: 'groups' | 'roles';
  onTabChange: (tab: string) => void;
  canReadRoles: boolean;
  canReadGroups: boolean;
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmType?: 'danger' | 'primary';
  saving: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export type CreateGroupTab = 'details' | 'members';

export interface CreateGroupDialogProps {
  open: boolean;
  onClose: () => void;
}

export type CreateRoleTab = 'details' | 'permissions' | 'members';

export interface CreateRoleDialogProps {
  open: boolean;
  onClose: () => void;
}

export interface EditGroupDialogProps {
  group: AdminGroup | null;
  canManage: boolean;
  onClose: () => void;
}

export interface EditRoleDialogProps {
  role: Role | null;
  canManage: boolean;
  onClose: () => void;
}

export interface GroupsTabProps {
  onCreateGroup: () => void;
}

export interface RolePermissionsPanelProps {
  permissions: RolePermissions;
  onChange: (permissions: RolePermissions) => void;
  disabled?: boolean;
}

export interface RolesTabProps {
  onCreateRole: () => void;
}
