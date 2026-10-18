import { useState, useMemo } from 'react';
import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import type { TUser } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  availableScopesOptions,
  groupAssignmentsQueryOptions,
  roleAssignmentsQueryOptions,
  usersQueryOptions,
} from '~/admin/api';
import {
  Avatar,
  EmptyState,
  KebabMenu,
  LoadingState,
  ScreenReaderAnnouncer,
  SearchInput,
} from '~/admin/components/shared';
import { useAnnouncement, useCapabilities, useLocalize } from '~/admin/hooks';
import { SystemCapabilities } from '~/admin/constants';
import { UserDetailDialog } from './UserDetailDialog';
import { useQuery } from '~/admin/query';
import { cn } from '~/admin/utils';
import { Icon } from '~/admin/ui';

const ROLE_FILTER_LABELS: Record<t.RoleFilter, string> = {
  all: 'com_admin_ui_all',
  admin: 'com_admin_users_admins',
  user: 'com_admin_nav_users',
};

export function UsersPage() {
  const localize = useLocalize();
  const { hasCapability } = useCapabilities();
  const canManageRoles = hasCapability(SystemCapabilities.MANAGE_ROLES);
  const canManageGroups = hasCapability(SystemCapabilities.MANAGE_GROUPS);
  const canAssignConfigs = hasCapability(SystemCapabilities.ASSIGN_CONFIGS);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<t.RoleFilter>('all');
  const [detailUser, setDetailUser] = useState<TUser | null>(null);
  const { message: announcement, announce } = useAnnouncement();

  const { data: users = [], isLoading } = useQuery(usersQueryOptions);
  const { data: roleAssignments = {} } = useQuery(roleAssignmentsQueryOptions);
  const { data: groupAssignments = {} } = useQuery(groupAssignmentsQueryOptions);
  const { data: allScopes = [] } = useQuery(availableScopesOptions);

  const userProfileSet = useMemo(() => {
    const set = new Set<string>();
    for (const s of allScopes) {
      if (s.principalType === PrincipalType.USER) set.add(s.principalId);
    }
    return set;
  }, [allScopes]);

  const applyFilters = (list: TUser[], q: string, role: t.RoleFilter) =>
    list.filter((u) => {
      if (role === 'admin' && u.role !== SystemRoles.ADMIN) return false;
      if (role === 'user' && u.role !== SystemRoles.USER) return false;
      if (q) {
        const lower = q.toLowerCase();
        return u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower);
      }
      return true;
    });

  const filtered = applyFilters(users, search, roleFilter);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    const count = applyFilters(users, value, roleFilter).length;
    announce(localize('com_admin_a11y_results_found', { count }));
  };

  const handleRoleFilter = (role: t.RoleFilter) => {
    setRoleFilter(role);
    const count = applyFilters(users, search, role).length;
    announce(localize('com_admin_a11y_filter_changed', { count }));
  };

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div
      role="region"
      aria-label={localize('com_admin_nav_users')}
      className="flex flex-1 flex-col gap-6 overflow-auto p-6"
    >
      <section aria-label={localize('com_admin_users_list')}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={handleSearchChange}
            placeholder={localize('com_admin_users_search')}
            className="relative flex-1"
          />

          <div
            className="flex gap-1"
            role="group"
            aria-label={localize('com_admin_users_role_filter')}
          >
            {(['all', 'admin', 'user'] as t.RoleFilter[]).map((role) => (
              <button
                key={role}
                type="button"
                aria-pressed={roleFilter === role}
                onClick={() => handleRoleFilter(role)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  roleFilter === role
                    ? 'bg-(--cui-color-background-active) text-(--cui-color-text-default)'
                    : 'text-(--cui-color-text-muted) hover:bg-(--cui-color-background-hover) hover:text-(--cui-color-text-default)',
                )}
              >
                {localize(ROLE_FILTER_LABELS[role])}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-(--cui-color-stroke-default)">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-(--cui-color-stroke-default) bg-(--cui-color-background-muted)">
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  {localize('com_admin_users_col_user')}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  {localize('com_admin_users_col_role')}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  {localize('com_admin_users_col_joined')}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  <span className="sr-only">{localize('com_admin_ui_actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user, i) => (
                <UserRow
                  key={user.id}
                  user={user}
                  roles={roleAssignments[user.id] ?? []}
                  groups={groupAssignments[user.id] ?? []}
                  hasUserProfile={userProfileSet.has(user.id)}
                  isLast={i === filtered.length - 1}
                  onViewDetails={() => setDetailUser(user)}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <EmptyState message={localize('com_admin_users_empty')} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-xs text-(--cui-color-text-muted)">
          {localize('com_admin_users_showing')} {filtered.length} {localize('com_admin_ui_of')}{' '}
          {users.length} {localize('com_admin_nav_users').toLowerCase()}
        </p>
      </section>

      <UserDetailDialog
        user={detailUser}
        onClose={() => setDetailUser(null)}
        canManageRoles={canManageRoles}
        canManageGroups={canManageGroups}
        canAssignConfigs={canAssignConfigs}
      />

      <ScreenReaderAnnouncer message={announcement} />
    </div>
  );
}

function UserRow({ user, roles, groups, hasUserProfile, isLast, onViewDetails }: t.UserRowProps) {
  const localize = useLocalize();

  const kebabItems: t.KebabMenuItem[] = [
    { label: localize('com_admin_users_view_details'), icon: 'user', onClick: onViewDetails },
  ];

  return (
    <tr
      className={cn(
        'cursor-pointer bg-(--cui-color-background-panel) transition-colors hover:bg-(--cui-color-background-hover)',
        !isLast && 'border-b border-(--cui-color-stroke-default)',
      )}
      onClick={onViewDetails}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} />
          <div className="flex flex-col gap-1">
            <div className="flex flex-col">
              <span className="font-medium text-(--cui-color-text-default)">{user.name}</span>
              <span className="text-xs text-(--cui-color-text-muted)">{user.email}</span>
            </div>
            {/* Role/group pills are user data returned by the API -- not gated by
                READ_ROLES/READ_GROUPS. The backend controls what data is included
                in the users response; the frontend renders what it receives. */}
            <div className="flex flex-wrap gap-1">
              {roles.map((r) => (
                <span
                  key={r.id}
                  className="badge-role text-3xs inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium"
                >
                  <span aria-hidden="true">
                    <Icon name="lock" size="xs" />
                  </span>
                  {r.name}
                </span>
              ))}
              {groups.map((g) => (
                <span
                  key={g.id}
                  className="badge-group text-3xs inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium"
                >
                  <span aria-hidden="true">
                    <Icon name="users" size="xs" />
                  </span>
                  {g.name}
                </span>
              ))}
              {hasUserProfile && (
                <span
                  className="badge-profile inline-flex items-center rounded-full p-1"
                  title={localize('com_admin_users_user_profile', { name: user.name })}
                  aria-label={localize('com_admin_users_user_profile', { name: user.name })}
                >
                  <Icon name="user" size="xs" />
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
            user.role === SystemRoles.ADMIN
              ? 'badge-admin'
              : 'bg-(--cui-color-background-secondary) text-(--cui-color-text-muted)',
          )}
        >
          {user.role}
        </span>
      </td>
      <td className="px-4 py-3 text-(--cui-color-text-muted)">
        {new Date(user.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <span onClick={(e) => e.stopPropagation()}>
          <KebabMenu
            items={kebabItems}
            ariaLabel={`${localize('com_admin_ui_actions')} ${user.name}`}
          />
        </span>
      </td>
    </tr>
  );
}
