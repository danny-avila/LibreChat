import { useState, useMemo } from 'react';
import { disabledInkClasses } from '@librechat/client';
import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import type { TUser } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  addGroupMemberFn,
  addRoleMemberFn,
  availableScopesOptions,
  createScopeFn,
  deleteScopeFn,
  groupAssignmentsQueryOptions,
  allGroupsQueryOptions,
  removeGroupMemberFn,
  removeRoleMemberFn,
  roleAssignmentsQueryOptions,
  allRolesQueryOptions,
} from '~/admin/api';
import { useQuery, useMutation, useQueryClient } from '~/admin/query';
import { Avatar, TrashButton } from '~/admin/components/shared';
import { cn, notifySuccess, notifyError } from '~/admin/utils';
import { ConfirmDialog } from '~/admin/components/access';
import { Button, Dialog, Icon } from '~/admin/ui';
import { useLocalize } from '~/admin/hooks';

const CONFIRM_TITLE_KEYS: Record<t.RemoveTarget['kind'], string> = {
  role: 'com_admin_users_remove_role_title',
  group: 'com_admin_users_remove_group_title',
  profile: 'com_admin_users_delete_profile_title',
};

/**
 * Write actions use granular capabilities from the caller:
 *   - canManageRoles  → MANAGE_ROLES (add/remove role assignments)
 *   - canManageGroups → MANAGE_GROUPS (add/remove group assignments)
 *   - canAssignConfigs → ASSIGN_CONFIGS (create/delete user config profiles)
 * Display data (role names, group names) is rendered from the API response
 * and is not independently gated by READ_ROLES/READ_GROUPS.
 */
export function UserDetailDialog({
  user,
  onClose,
  canManageRoles = false,
  canManageGroups = false,
  canAssignConfigs = false,
}: t.UserDetailDialogProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();

  const [view, setView] = useState<'main' | 'add'>('main');
  const [removeTarget, setRemoveTarget] = useState<t.RemoveTarget | null>(null);

  const { data: roleAssignmentMap = {} } = useQuery(roleAssignmentsQueryOptions);
  const { data: groupAssignmentMap = {} } = useQuery(groupAssignmentsQueryOptions);
  const { data: allRoles = [] } = useQuery(allRolesQueryOptions);
  const { data: allGroups = [] } = useQuery(allGroupsQueryOptions);
  const { data: allScopes = [] } = useQuery(availableScopesOptions);

  const userId = user?.id;
  const userName = user?.name ?? '';

  const userRoles = useMemo(
    () => (userId ? (roleAssignmentMap[userId] ?? []) : []),
    [roleAssignmentMap, userId],
  );
  const userGroups = useMemo(
    () => (userId ? (groupAssignmentMap[userId] ?? []) : []),
    [groupAssignmentMap, userId],
  );

  const userProfile = useMemo(
    () =>
      userId
        ? allScopes.find((s) => s.principalType === PrincipalType.USER && s.principalId === userId)
        : undefined,
    [allScopes, userId],
  );

  const availableRoles = useMemo(
    () => allRoles.filter((r) => !userRoles.some((ur) => ur.id === r.id)),
    [allRoles, userRoles],
  );

  const availableGroups = useMemo(
    () => allGroups.filter((g) => !userGroups.some((ug) => ug.id === g.id)),
    [allGroups, userGroups],
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['roleAssignments'] });
    queryClient.invalidateQueries({ queryKey: ['groupAssignments'] });
    queryClient.invalidateQueries({ queryKey: ['roles'] });
    queryClient.invalidateQueries({ queryKey: ['groups'] });
    queryClient.invalidateQueries({ queryKey: ['roleMembers'] });
    queryClient.invalidateQueries({ queryKey: ['groupMembers'] });
    queryClient.invalidateQueries({ queryKey: ['availableScopes'] });
  };

  const handleError = (err: Error) => notifyError(err.message);

  const addRoleMutation = useMutation({
    mutationFn: (role: { id: string; name: string }) => {
      if (!userId) throw new Error('No user selected');
      return addRoleMemberFn({ data: { roleId: role.id, userId } });
    },
    onSuccess: (_data, role) => {
      invalidateAll();
      notifySuccess(localize('com_admin_toast_role_assigned', { name: role.name }));
    },
    onError: handleError,
  });

  const removeRoleMutation = useMutation({
    mutationFn: (role: { id: string; name: string }) => {
      if (!userId) throw new Error('No user selected');
      return removeRoleMemberFn({ data: { roleId: role.id, userId } });
    },
    onSuccess: (_data, role) => {
      invalidateAll();
      notifySuccess(localize('com_admin_toast_role_unassigned', { name: role.name }));
      setRemoveTarget(null);
    },
    onError: handleError,
  });

  const addGroupMutation = useMutation({
    mutationFn: (group: { id: string; name: string }) => {
      if (!userId) throw new Error('No user selected');
      return addGroupMemberFn({ data: { groupId: group.id, userId } });
    },
    onSuccess: (_data, group) => {
      invalidateAll();
      notifySuccess(localize('com_admin_toast_group_assigned', { name: group.name }));
    },
    onError: handleError,
  });

  const removeGroupMutation = useMutation({
    mutationFn: (group: { id: string; name: string }) => {
      if (!userId) throw new Error('No user selected');
      return removeGroupMemberFn({ data: { groupId: group.id, userId } });
    },
    onSuccess: (_data, group) => {
      invalidateAll();
      notifySuccess(localize('com_admin_toast_group_unassigned', { name: group.name }));
      setRemoveTarget(null);
    },
    onError: handleError,
  });

  const createProfileMutation = useMutation({
    mutationFn: (vars: { userId: string; name: string }) =>
      createScopeFn({
        data: {
          principalType: PrincipalType.USER,
          name: vars.name,
          priority: 100,
          principalId: vars.userId,
        },
      }),
    onSuccess: (_data, vars) => {
      invalidateAll();
      notifySuccess(localize('com_admin_toast_user_profile_created', { name: vars.name }));
    },
    onError: handleError,
  });

  const deleteProfileMutation = useMutation({
    mutationFn: (scope: t.ConfigScope) =>
      deleteScopeFn({
        data: { principalType: scope.principalType, principalId: scope.principalId },
      }),
    onSuccess: () => {
      invalidateAll();
      notifySuccess(localize('com_admin_toast_user_profile_deleted'));
      setRemoveTarget(null);
    },
    onError: handleError,
  });

  const busy =
    removeRoleMutation.isPending ||
    removeGroupMutation.isPending ||
    deleteProfileMutation.isPending;

  const handleClose = () => {
    setView('main');
    setRemoveTarget(null);
    onClose();
  };

  const handleConfirmRemove = () => {
    if (!removeTarget) return;
    if (removeTarget.kind === 'role') {
      removeRoleMutation.mutate({ id: removeTarget.ref.id, name: removeTarget.ref.name });
    } else if (removeTarget.kind === 'group') {
      removeGroupMutation.mutate({ id: removeTarget.ref.id, name: removeTarget.ref.name });
    } else if (removeTarget.kind === 'profile') {
      deleteProfileMutation.mutate(removeTarget.scope);
    }
  };

  const confirmTitle = removeTarget ? localize(CONFIRM_TITLE_KEYS[removeTarget.kind]) : '';

  const confirmDesc = getConfirmDesc(removeTarget, userName, localize);

  const dialogTitle =
    view === 'add'
      ? localize('com_admin_users_add_profiles_title')
      : localize('com_admin_users_detail_title');

  return (
    <>
      <Dialog
        open={!!user}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleClose();
        }}
      >
        <Dialog.Content title={dialogTitle} showClose onClose={handleClose} className="max-w-lg!">
          {user && view === 'main' && (
            <div
              className="flex flex-col gap-5"
              aria-label={localize('com_admin_users_detail_title')}
            >
              <UserHeader user={user} />

              <ProfileList
                roles={userRoles}
                groups={userGroups}
                userProfile={userProfile}
                userName={userName}
                busy={busy}
                canManageRoles={canManageRoles}
                canManageGroups={canManageGroups}
                canAssignConfigs={canAssignConfigs}
                onRemoveRole={(id) => {
                  const ref = userRoles.find((r) => r.id === id);
                  if (ref) setRemoveTarget({ kind: 'role', ref });
                }}
                onRemoveGroup={(id) => {
                  const ref = userGroups.find((g) => g.id === id);
                  if (ref) setRemoveTarget({ kind: 'group', ref });
                }}
                onDeleteUserProfile={(scope) => setRemoveTarget({ kind: 'profile', scope })}
              />

              {(canManageRoles || canManageGroups || canAssignConfigs) && (
                <Button
                  htmlType="button"
                  type="secondary"
                  label={localize('com_admin_users_add_profiles')}
                  onClick={() => setView('add')}
                />
              )}
            </div>
          )}

          {user && view === 'add' && (
            <AddProfilesPanel
              availableRoles={availableRoles}
              availableGroups={availableGroups}
              hasUserProfile={!!userProfile}
              userName={userName}
              busy={
                addRoleMutation.isPending ||
                addGroupMutation.isPending ||
                createProfileMutation.isPending
              }
              canManageRoles={canManageRoles}
              canManageGroups={canManageGroups}
              canAssignConfigs={canAssignConfigs}
              onAddRole={(id) => {
                if (addRoleMutation.isPending) return;
                const role = availableRoles.find((r) => r.id === id);
                if (role) addRoleMutation.mutate({ id: role.id, name: role.name });
              }}
              onAddGroup={(id) => {
                if (addGroupMutation.isPending) return;
                const group = availableGroups.find((g) => g.id === id);
                if (group) addGroupMutation.mutate({ id: group.id, name: group.name });
              }}
              onCreateUserProfile={() => {
                if (createProfileMutation.isPending || !userId) return;
                createProfileMutation.mutate({ userId, name: userName });
              }}
              onDone={() => setView('main')}
            />
          )}
        </Dialog.Content>
      </Dialog>

      <ConfirmDialog
        open={!!removeTarget}
        title={confirmTitle}
        description={confirmDesc}
        confirmLabel={localize(
          removeTarget?.kind === 'profile'
            ? 'com_admin_ui_delete'
            : 'com_admin_access_remove_member',
        )}
        saving={busy}
        onConfirm={handleConfirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </>
  );
}

function getConfirmDesc(
  target: t.RemoveTarget | null,
  userName: string,
  localize: (key: string, vars?: Record<string, string>) => string,
): string {
  if (!target) return '';
  if (target.kind === 'role') {
    return localize('com_admin_users_remove_role_desc', { user: userName, name: target.ref.name });
  }
  if (target.kind === 'group') {
    return localize('com_admin_users_remove_group_desc', { user: userName, name: target.ref.name });
  }
  return localize('com_admin_users_delete_profile_desc', { name: userName });
}

function UserHeader({ user }: { user: TUser }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={user.name} size="md" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-base font-semibold text-(--cui-color-text-default)">
          {user.name}
        </span>
        <span className="truncate text-sm text-(--cui-color-text-muted)">{user.email}</span>
        <span
          className={cn(
            'text-3xs mt-1 inline-block w-fit rounded-full px-2 py-0.5 font-medium',
            user.role === SystemRoles.ADMIN
              ? 'badge-admin'
              : 'bg-(--cui-color-background-secondary) text-(--cui-color-text-muted)',
          )}
        >
          {user.role}
        </span>
      </div>
    </div>
  );
}

function ProfileList({
  roles,
  groups,
  userProfile,
  userName,
  busy,
  canManageRoles,
  canManageGroups,
  canAssignConfigs,
  onRemoveRole,
  onRemoveGroup,
  onDeleteUserProfile,
}: t.ProfileListProps) {
  const localize = useLocalize();
  const empty = roles.length === 0 && groups.length === 0 && !userProfile;

  if (empty) {
    return (
      <p className="py-4 text-center text-sm text-(--cui-color-text-muted)">
        {localize('com_admin_users_no_profiles')}
      </p>
    );
  }

  return (
    <ul
      aria-label={localize('com_admin_a11y_assigned_profiles')}
      className="flex flex-col divide-y divide-(--cui-color-stroke-default) rounded-lg border border-(--cui-color-stroke-default)"
    >
      {roles.map((role) => (
        <ProfileRow
          key={`role-${role.id}`}
          icon="lock"
          colorClass="badge-role"
          label={role.name}
          onRemove={() => onRemoveRole(role.id)}
          removeLabel={localize('com_admin_a11y_remove_role', { name: role.name })}
          busy={busy}
          canRemove={canManageRoles}
        />
      ))}
      {groups.map((group) => (
        <ProfileRow
          key={`group-${group.id}`}
          icon="users"
          colorClass="badge-group"
          label={group.name}
          onRemove={() => onRemoveGroup(group.id)}
          removeLabel={localize('com_admin_a11y_remove_group', { name: group.name })}
          busy={busy}
          canRemove={canManageGroups}
        />
      ))}
      {userProfile && (
        <ProfileRow
          icon="user"
          colorClass="badge-profile"
          label={localize('com_admin_users_user_profile', { name: userName })}
          onRemove={() => onDeleteUserProfile(userProfile)}
          removeLabel={localize('com_admin_a11y_remove_user_profile')}
          busy={busy}
          canRemove={canAssignConfigs}
        />
      )}
    </ul>
  );
}

function ProfileRow({
  icon,
  colorClass,
  label,
  onRemove,
  removeLabel,
  busy,
  canRemove,
}: t.ProfileRowProps) {
  return (
    <li className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-2 text-sm text-(--cui-color-text-default)">
        <span
          className={cn('inline-flex items-center rounded-full p-1', colorClass)}
          aria-hidden="true"
        >
          <Icon name={icon} size="xs" />
        </span>
        {label}
      </div>
      {canRemove && <TrashButton onClick={onRemove} ariaLabel={removeLabel} disabled={busy} />}
    </li>
  );
}

function AddProfilesPanel({
  availableRoles,
  availableGroups,
  hasUserProfile,
  userName,
  busy,
  canManageRoles,
  canManageGroups,
  canAssignConfigs,
  onAddRole,
  onAddGroup,
  onCreateUserProfile,
  onDone,
}: t.AddProfilesPanelProps) {
  const localize = useLocalize();

  return (
    <div
      className="flex flex-col gap-5"
      aria-label={localize('com_admin_users_add_profiles_title')}
    >
      {canManageRoles && (
        <PickerSection
          label={localize('com_admin_users_roles_label')}
          listLabel={localize('com_admin_a11y_available_roles')}
          icon="lock"
          colorClass="badge-role"
          items={availableRoles}
          emptyLabel={localize('com_admin_users_all_roles_assigned')}
          busy={busy}
          onSelect={onAddRole}
        />
      )}
      {canManageGroups && (
        <PickerSection
          label={localize('com_admin_users_groups_label')}
          listLabel={localize('com_admin_a11y_available_groups')}
          icon="users"
          colorClass="badge-group"
          items={availableGroups}
          emptyLabel={localize('com_admin_users_all_groups_assigned')}
          busy={busy}
          onSelect={onAddGroup}
        />
      )}
      {canAssignConfigs && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-(--cui-color-text-muted)">
            {localize('com_admin_users_user_profile', { name: userName })}
          </span>
          {hasUserProfile ? (
            <span className="py-1 text-xs text-(--cui-color-text-muted)">
              {localize('com_admin_users_profile_already_created')}
            </span>
          ) : (
            <button
              type="button"
              disabled={busy}
              aria-disabled={busy}
              onClick={onCreateUserProfile}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg border border-(--cui-color-stroke-default) px-3 py-2 text-sm text-(--cui-color-text-default) transition-colors hover:bg-(--cui-color-background-hover) disabled:pointer-events-none disabled:opacity-50',
                disabledInkClasses,
              )}
            >
              <span
                className="badge-profile inline-flex items-center rounded-full p-1"
                aria-hidden="true"
              >
                <Icon name="user" size="xs" />
              </span>
              {localize('com_admin_users_create_user_profile', { name: userName })}
            </button>
          )}
        </div>
      )}
      <div className="flex justify-end">
        <Button
          htmlType="button"
          type="secondary"
          label={localize('com_admin_ui_done')}
          onClick={onDone}
        />
      </div>
    </div>
  );
}

function PickerSection({
  label,
  listLabel,
  icon,
  colorClass,
  items,
  emptyLabel,
  busy,
  onSelect,
}: t.PickerSectionProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-(--cui-color-text-muted)">{label}</span>
      {items.length > 0 ? (
        <ul
          aria-label={listLabel}
          className="flex max-h-48 flex-col overflow-auto rounded-lg border border-(--cui-color-stroke-default)"
        >
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={busy}
                aria-disabled={busy}
                onClick={() => onSelect(item.id)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-(--cui-color-text-default) transition-colors hover:bg-(--cui-color-background-hover) disabled:pointer-events-none disabled:opacity-50',
                  disabledInkClasses,
                  i < items.length - 1 && 'border-b border-(--cui-color-stroke-default)',
                )}
              >
                <span
                  className={cn('inline-flex items-center rounded-full p-1', colorClass)}
                  aria-hidden="true"
                >
                  <Icon name={icon} size="xs" />
                </span>
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <span className="py-1 text-xs text-(--cui-color-text-muted)">{emptyLabel}</span>
      )}
    </div>
  );
}
