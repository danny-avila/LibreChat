import { useState, useEffect, useRef } from 'react';
import type { AdminGroup } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  LoadingState,
  SearchInput,
  EmptyState,
  Pagination,
  TrashButton,
} from '~/admin/components/shared';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '~/admin/query';
import { deleteGroupFn, groupsQueryOptions, GROUPS_PAGE_SIZE } from '~/admin/api';
import { cn, notifySuccess, notifyError } from '~/admin/utils';
import { useCapabilities, useLocalize } from '~/admin/hooks';
import { SystemCapabilities } from '~/admin/constants';
import { EditGroupDialog } from './EditGroupDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { Button } from '~/admin/ui';

export function GroupsTab({ onCreateGroup }: t.GroupsTabProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { hasCapability } = useCapabilities();
  const canManage = hasCapability(SystemCapabilities.MANAGE_GROUPS);
  const [editTarget, setEditTarget] = useState<AdminGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminGroup | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  };

  const { data, isLoading, isError, isFetching } = useQuery({
    ...groupsQueryOptions(page, debouncedSearch),
    placeholderData: keepPreviousData,
  });

  const groups = data?.groups ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / GROUPS_PAGE_SIZE);

  const deleteMutation = useMutation({
    mutationFn: (group: AdminGroup) => deleteGroupFn({ data: { id: group.id } }),
    onSuccess: (_data, group) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['availableScopes'] });
      queryClient.invalidateQueries({ queryKey: ['groupAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['groupMembers'] });
      notifySuccess(localize('com_admin_toast_group_deleted', { name: group.name }));
      setDeleteTarget(null);
      if (groups.length === 1) {
        setPage((prev) => (prev > 1 ? prev - 1 : prev));
      }
    },
    onError: (err: Error) => notifyError(err.message),
  });

  if (isLoading && !data) {
    return <LoadingState />;
  }

  if (isError && !data) {
    return (
      <div className="px-4 py-8 text-center text-sm text-(--cui-color-foreground-danger)">
        {localize('com_admin_error_load_groups')}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2 pr-1">
      <div className="flex items-center justify-between gap-3">
        <SearchInput
          value={search}
          onChange={handleSearchChange}
          placeholder={localize('com_admin_access_search_groups')}
        />
        <Button
          htmlType="button"
          type="secondary"
          iconLeft="plus"
          label={localize('com_admin_access_create_group')}
          onClick={onCreateGroup}
          disabled={!canManage}
          aria-disabled={!canManage || undefined}
          title={
            !canManage
              ? localize('com_admin_cap_no_permission', { cap: SystemCapabilities.MANAGE_GROUPS })
              : undefined
          }
        />
      </div>

      {groups.length === 0 ? (
        <EmptyState message={localize('com_admin_access_groups_empty')} />
      ) : (
        <div className={cn('flex flex-col', isFetching && 'opacity-60 transition-opacity')}>
          {groups.map((group) => (
            <div
              key={group.id}
              className="mb-2 flex items-center gap-3 rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-panel) px-3 py-3"
            >
              <button
                type="button"
                onClick={() => setEditTarget(group)}
                className="-my-2 -ml-2 min-w-0 flex-1 cursor-pointer rounded py-3 pl-3 text-left outline-none focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-(--cui-color-outline)"
              >
                <div className="text-sm font-medium text-(--cui-color-text-default) hover:underline">
                  {group.name}
                </div>
                {group.description && (
                  <div className="truncate text-xs text-(--cui-color-text-muted)">
                    {group.description}
                  </div>
                )}
              </button>

              {canManage && (
                <TrashButton
                  onClick={() => setDeleteTarget(group)}
                  ariaLabel={`${localize('com_admin_ui_delete')} ${group.name}`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

      <EditGroupDialog
        key={editTarget?.id}
        group={editTarget}
        canManage={canManage}
        onClose={() => setEditTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={localize('com_admin_access_delete_group_title')}
        description={localize('com_admin_access_delete_group_desc', {
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
