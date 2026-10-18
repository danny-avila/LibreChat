import { useMemo, useState } from 'react';
import type * as t from '~/admin/types';
import {
  LoadingState,
  Pagination,
  SearchInput,
  EmptyState,
  TrashButton,
} from '~/admin/components/shared';
import { deleteRoleFn, allRolesQueryOptions, ROLES_PAGE_SIZE } from '~/admin/api';
import { useQuery, useMutation, useQueryClient } from '~/admin/query';
import { useCapabilities, useLocalize } from '~/admin/hooks';
import { notifySuccess, notifyError } from '~/admin/utils';
import { SystemCapabilities } from '~/admin/constants';
import { EditRoleDialog } from './EditRoleDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { Button } from '~/admin/ui';

export function RolesTab({ onCreateRole }: t.RolesTabProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { hasCapability } = useCapabilities();
  const canManage = hasCapability(SystemCapabilities.MANAGE_ROLES);
  const [editTarget, setEditTarget] = useState<t.Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<t.Role | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data: allRoles = [], isLoading, isError } = useQuery(allRolesQueryOptions);

  const filtered = useMemo(() => {
    if (!search) return allRoles;
    const q = search.toLowerCase();
    return allRoles.filter(
      (role) => role.name.toLowerCase().includes(q) || role.description.toLowerCase().includes(q),
    );
  }, [allRoles, search]);

  const totalPages = Math.ceil(filtered.length / ROLES_PAGE_SIZE);
  const paged = useMemo(
    () => filtered.slice((page - 1) * ROLES_PAGE_SIZE, page * ROLES_PAGE_SIZE),
    [filtered, page],
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const deleteMutation = useMutation({
    mutationFn: (role: t.Role) => deleteRoleFn({ data: { id: role.id } }),
    onSuccess: (_data, role) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['availableScopes'] });
      queryClient.invalidateQueries({ queryKey: ['roleAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['roleMembers'] });
      notifySuccess(localize('com_admin_toast_role_deleted', { name: role.name }));
      setDeleteTarget(null);
      if (paged.length === 1) {
        setPage((prev) => (prev > 1 ? prev - 1 : prev));
      }
    },
    onError: (err: Error) => notifyError(err.message),
  });

  if (isLoading) {
    return <LoadingState />;
  }

  if (isError) {
    return <EmptyState message={localize('com_admin_access_roles_error')} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2 pr-1">
      <div className="flex items-center justify-between gap-3">
        <SearchInput
          value={search}
          onChange={handleSearchChange}
          placeholder={localize('com_admin_access_search_roles')}
        />
        <Button
          htmlType="button"
          type="secondary"
          iconLeft="plus"
          label={localize('com_admin_access_create_role')}
          onClick={onCreateRole}
          disabled={!canManage}
          aria-disabled={!canManage || undefined}
          title={
            !canManage
              ? localize('com_admin_cap_no_permission', { cap: SystemCapabilities.MANAGE_ROLES })
              : undefined
          }
        />
      </div>

      {paged.length === 0 ? (
        <EmptyState
          message={
            search
              ? localize('com_admin_access_no_results')
              : localize('com_admin_access_roles_empty')
          }
        />
      ) : (
        <div className="flex flex-col">
          {paged.map((role) => (
            <div
              key={role.id}
              className="mb-2 flex items-center gap-3 rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-panel) px-3 py-3"
            >
              <button
                type="button"
                onClick={() => setEditTarget(role)}
                className="-my-2 -ml-2 min-w-0 flex-1 cursor-pointer rounded py-3 pl-3 text-left outline-none focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-(--cui-color-outline)"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-(--cui-color-text-default) hover:underline">
                    {role.name}
                  </span>
                  {role.isSystemRole && (
                    <span className="text-3xs inline-block rounded-full bg-(--cui-color-background-secondary) px-2 py-0.5 font-medium text-(--cui-color-text-default)">
                      {localize('com_admin_access_system_role')}
                    </span>
                  )}
                </div>
                {role.description && (
                  <div className="truncate text-xs text-(--cui-color-text-muted)">
                    {role.description}
                  </div>
                )}
              </button>

              {canManage && !role.isSystemRole && (
                <TrashButton
                  onClick={() => setDeleteTarget(role)}
                  ariaLabel={`${localize('com_admin_ui_delete')} ${role.name}`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

      <EditRoleDialog
        key={editTarget?.id}
        role={editTarget}
        canManage={canManage}
        onClose={() => setEditTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={localize('com_admin_access_delete_role_title')}
        description={localize('com_admin_access_delete_role_desc', {
          name: deleteTarget?.name ?? '',
        })}
        confirmLabel={localize('com_admin_ui_delete')}
        saving={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
