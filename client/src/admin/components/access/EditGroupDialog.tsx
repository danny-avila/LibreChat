import { useState, useCallback } from 'react';
import { disabledFillClasses } from '@librechat/client';
import type { AdminMember, AdminUserSearchResult } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  addGroupMemberFn,
  groupMembersQueryOptions,
  removeGroupMemberFn,
  updateGroupFn,
  MEMBERS_PAGE_SIZE,
} from '~/admin/api';
import {
  Avatar,
  LoadingState,
  Pagination,
  SelectedMemberList,
  TrashButton,
  UserSearchInline,
} from '~/admin/components/shared';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '~/admin/query';
import { cn, notifySuccess, notifyError } from '~/admin/utils';
import { Button, Dialog, Tabs } from '~/admin/ui';
import { useLocalize } from '~/admin/hooks';

type EditGroupTab = 'details' | 'members';

export function EditGroupDialog({ group, canManage, onClose }: t.EditGroupDialogProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<EditGroupTab>('details');
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [error, setError] = useState('');

  const [page, setPage] = useState(1);
  const [pendingAdditions, setPendingAdditions] = useState<AdminUserSearchResult[]>([]);
  const [pendingRemovals, setPendingRemovals] = useState<AdminMember[]>([]);

  const membersQuery = useQuery({
    ...groupMembersQueryOptions(group?.id ?? '', page),
    placeholderData: keepPreviousData,
    enabled: !!group,
  });

  const members = membersQuery.data?.members ?? [];
  const total = membersQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / MEMBERS_PAGE_SIZE);
  const removalIds = new Set(pendingRemovals.map((m) => m.userId));
  const existingIds = [...members.map((m) => m.userId), ...pendingAdditions.map((u) => u.id)];

  const detailsDirty = name !== group?.name || description !== group?.description;
  const membersDirty = pendingAdditions.length > 0 || pendingRemovals.length > 0;

  const addUser = (user: AdminUserSearchResult) => {
    setPendingAdditions((prev) => {
      if (prev.some((u) => u.id === user.id)) return prev;
      return [...prev, user];
    });
  };

  const removePendingUser = (userId: string) => {
    setPendingAdditions((prev) => prev.filter((u) => u.id !== userId));
  };

  const stageRemoval = useCallback((member: AdminMember) => {
    setPendingRemovals((prev) => {
      if (prev.some((m) => m.userId === member.userId)) return prev;
      return [...prev, member];
    });
  }, []);

  const unstageRemoval = (userId: string) => {
    setPendingRemovals((prev) => prev.filter((m) => m.userId !== userId));
  };

  const mutation = useMutation({
    mutationFn: async ({ name: submittedName }: { name: string }) => {
      if (!group) throw new Error(localize('com_admin_access_group_unavailable'));
      if (detailsDirty) {
        await updateGroupFn({ data: { id: group.id, name: submittedName, description } });
      }
      const memberResults = await Promise.allSettled([
        ...pendingAdditions.map((user) =>
          addGroupMemberFn({ data: { groupId: group.id, userId: user.id } }),
        ),
        ...pendingRemovals.map((member) =>
          removeGroupMemberFn({ data: { groupId: group.id, userId: member.userId } }),
        ),
      ]);
      const failures = memberResults.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      if (failures.length > 0) {
        const parts: string[] = [];
        if (detailsDirty) parts.push(localize('com_admin_access_details_saved'));
        parts.push(localize('com_admin_access_member_ops_failed', { count: failures.length }));
        throw new Error(parts.join(', '));
      }
      return { name: submittedName };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['groupAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['groupMembers', group?.id] });
      notifySuccess(localize('com_admin_toast_group_updated', { name: data.name }));
      onClose();
    },
    onError: (err: Error) => notifyError(err.message),
  });

  const doSubmit = () => {
    setError('');
    if (!group) return;
    if (!name.trim()) {
      setError(localize('com_admin_access_name_required'));
      setActiveTab('details');
      return;
    }
    mutation.mutate({ name });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSubmit();
  };

  return (
    <Dialog
      open={!!group}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Dialog.Content
        title={localize('com_admin_access_edit_group')}
        showClose
        onClose={onClose}
        className="max-w-2xl!"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as EditGroupTab)}
            ariaLabel={localize('com_admin_access_edit_group')}
          >
            <Tabs.TriggersList>
              <Tabs.Trigger value="details">
                {localize('com_admin_access_tab_details')}
              </Tabs.Trigger>
              <Tabs.Trigger value="members">
                {localize('com_admin_access_tab_members')}
              </Tabs.Trigger>
            </Tabs.TriggersList>
            <Tabs.Content
              value="details"
              forceMount
              tabIndex={-1}
              className={cn(activeTab !== 'details' && 'hidden')}
            >
              <div className="flex flex-col gap-5 pt-5">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="edit-group-name"
                    className="text-sm font-medium text-(--cui-color-text-default)"
                  >
                    {localize('com_admin_access_col_name')}
                  </label>
                  <input
                    id="edit-group-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={localize('com_admin_access_group_name_placeholder')}
                    disabled={!canManage}
                    readOnly={!canManage}
                    className={cn(
                      'rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-default) px-3 py-2 text-sm text-(--cui-color-text-default) placeholder:text-(--cui-color-text-disabled) disabled:cursor-not-allowed disabled:opacity-50',
                      disabledFillClasses,
                    )}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="edit-group-description"
                    className="text-sm font-medium text-(--cui-color-text-default)"
                  >
                    {localize('com_admin_config_field_description')}
                  </label>
                  <input
                    id="edit-group-description"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={localize('com_admin_access_group_desc_placeholder')}
                    disabled={!canManage}
                    readOnly={!canManage}
                    className={cn(
                      'rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-default) px-3 py-2 text-sm text-(--cui-color-text-default) placeholder:text-(--cui-color-text-disabled) disabled:cursor-not-allowed disabled:opacity-50',
                      disabledFillClasses,
                    )}
                  />
                </div>
              </div>
            </Tabs.Content>
            <Tabs.Content
              value="members"
              forceMount
              tabIndex={-1}
              className={cn(activeTab !== 'members' && 'hidden')}
            >
              <div className="flex flex-col gap-4 pt-5">
                {canManage && (
                  <UserSearchInline
                    existingIds={existingIds}
                    onAdd={addUser}
                    listboxId="edit-group-member-search"
                    disabled={mutation.isPending}
                  />
                )}
                {pendingAdditions.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-(--cui-color-text-muted)">
                      {localize('com_admin_access_pending_additions', {
                        count: pendingAdditions.length,
                      })}
                    </span>
                    <SelectedMemberList
                      users={pendingAdditions}
                      onRemove={removePendingUser}
                      disabled={mutation.isPending}
                    />
                  </div>
                )}
                {pendingRemovals.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-(--cui-color-text-muted)">
                      {localize('com_admin_access_pending_removals', {
                        count: pendingRemovals.length,
                      })}
                    </span>
                    <SelectedMemberList
                      users={pendingRemovals.map((m) => ({
                        id: m.userId,
                        name: m.name,
                        email: m.email,
                        avatarUrl: m.avatarUrl,
                      }))}
                      onRemove={unstageRemoval}
                      disabled={mutation.isPending}
                    />
                  </div>
                )}
                <MemberList
                  members={members}
                  loading={membersQuery.isLoading}
                  error={membersQuery.isError}
                  fetching={membersQuery.isFetching}
                  removalIds={removalIds}
                  onRemove={stageRemoval}
                  canManage={canManage}
                  total={total}
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </div>
            </Tabs.Content>
          </Tabs>

          {error && (
            <p role="alert" className="text-sm text-(--cui-color-text-danger)">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button
              htmlType="button"
              type="secondary"
              label={localize('com_admin_ui_cancel')}
              onClick={onClose}
              disabled={mutation.isPending}
            />
            <Button
              htmlType="submit"
              type="primary"
              label={localize('com_admin_ui_save')}
              disabled={
                !canManage || !name.trim() || (!detailsDirty && !membersDirty) || mutation.isPending
              }
            />
          </div>
        </form>
      </Dialog.Content>
    </Dialog>
  );
}

interface MemberListProps {
  members: AdminMember[];
  loading: boolean;
  error: boolean;
  fetching: boolean;
  removalIds: Set<string>;
  onRemove: (member: AdminMember) => void;
  canManage: boolean;
  total: number;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function MemberList({
  members,
  loading,
  error,
  fetching,
  removalIds,
  onRemove,
  canManage,
  total,
  currentPage,
  totalPages,
  onPageChange,
}: MemberListProps) {
  const localize = useLocalize();

  if (loading) {
    return (
      <LoadingState className="flex items-center justify-center gap-2 py-6 text-sm text-(--cui-color-text-muted)" />
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-(--cui-color-foreground-danger)">
        {localize('com_admin_error_load_members')}
      </div>
    );
  }

  if (members.length === 0 && total === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-(--cui-color-text-muted)">
        {localize('com_admin_access_no_members')}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <span className="mb-2 text-xs font-medium text-(--cui-color-text-muted)">
        {localize('com_admin_access_member_count', { count: total })}
      </span>
      <div
        className={cn(
          'max-h-64 overflow-auto rounded-lg border border-(--cui-color-stroke-default)',
          fetching && 'opacity-60 transition-opacity',
        )}
      >
        {members.map((member, i) => {
          const staged = removalIds.has(member.userId);
          return (
            <div
              key={member.userId}
              className={cn(
                'flex items-center justify-between px-3 py-2',
                i < members.length - 1 && 'border-b border-(--cui-color-stroke-default)',
                staged && 'opacity-40',
              )}
            >
              <div className="flex items-center gap-3">
                <Avatar name={member.name} />
                <div className="flex flex-col">
                  <span
                    className={cn(
                      'text-sm font-medium text-(--cui-color-text-default)',
                      staged && 'line-through',
                    )}
                  >
                    {member.name}
                  </span>
                  <span className="text-xs text-(--cui-color-text-muted)">{member.email}</span>
                </div>
              </div>
              {canManage && !staged && (
                <TrashButton
                  onClick={() => onRemove(member)}
                  ariaLabel={`${localize('com_admin_access_remove_member')} ${member.name}`}
                />
              )}
            </div>
          );
        })}
      </div>
      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
}
