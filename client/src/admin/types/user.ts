import type { TUser } from 'librechat-data-provider';
import type { ConfigScope, IconName } from './scope';

export interface AssignmentRef {
  id: string;
  name: string;
}

export interface UserAssignment {
  roles: AssignmentRef[];
  groups: AssignmentRef[];
}

export type RoleFilter = 'all' | 'admin' | 'user';

export interface UserRowProps {
  user: TUser;
  roles: AssignmentRef[];
  groups: AssignmentRef[];
  hasUserProfile: boolean;
  isLast: boolean;
  onViewDetails: () => void;
}

export type RemoveTarget =
  | { kind: 'role'; ref: AssignmentRef }
  | { kind: 'group'; ref: AssignmentRef }
  | { kind: 'profile'; scope: ConfigScope };

export interface UserDetailDialogProps {
  user: TUser | null;
  onClose: () => void;
  canManageRoles?: boolean;
  canManageGroups?: boolean;
  canAssignConfigs?: boolean;
}

export interface ProfileListProps {
  roles: AssignmentRef[];
  groups: AssignmentRef[];
  userProfile: ConfigScope | undefined;
  userName: string;
  busy: boolean;
  canManageRoles: boolean;
  canManageGroups: boolean;
  canAssignConfigs: boolean;
  onRemoveRole: (roleId: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onDeleteUserProfile: (scope: ConfigScope) => void;
}

export interface ProfileRowProps {
  icon: IconName;
  colorClass: string;
  label: string;
  onRemove: () => void;
  removeLabel: string;
  busy: boolean;
  canRemove: boolean;
}

export interface AddProfilesPanelProps {
  availableRoles: AssignmentRef[];
  availableGroups: AssignmentRef[];
  hasUserProfile: boolean;
  userName: string;
  busy: boolean;
  canManageRoles: boolean;
  canManageGroups: boolean;
  canAssignConfigs: boolean;
  onAddRole: (roleId: string) => void;
  onAddGroup: (groupId: string) => void;
  onCreateUserProfile: () => void;
  onDone: () => void;
}

export interface PickerSectionProps {
  label: string;
  listLabel: string;
  icon: IconName;
  colorClass: string;
  items: AssignmentRef[];
  emptyLabel: string;
  busy: boolean;
  onSelect: (id: string) => void;
}
