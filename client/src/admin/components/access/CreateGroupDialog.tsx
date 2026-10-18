import { useState } from 'react';
import type { AdminUserSearchResult } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { SelectedMemberList, UserSearchInline } from '~/admin/components/shared';
import { cn, notifySuccess, notifyError } from '~/admin/utils';
import { addGroupMemberFn, createGroupFn } from '~/admin/api';
import { useMutation, useQueryClient } from '~/admin/query';
import { Button, Dialog, Tabs } from '~/admin/ui';
import { useLocalize } from '~/admin/hooks';

export function CreateGroupDialog({ open, onClose }: t.CreateGroupDialogProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<t.CreateGroupTab>('details');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<AdminUserSearchResult[]>([]);
  const [error, setError] = useState('');

  const resetAndClose = () => {
    setName('');
    setDescription('');
    setSelectedUsers([]);
    setError('');
    setActiveTab('details');
    onClose();
  };

  const mutation = useMutation({
    mutationFn: async ({ name: submittedName }: { name: string }) => {
      const { group } = await createGroupFn({
        data: { name: submittedName, description },
      });
      for (const user of selectedUsers) {
        await addGroupMemberFn({ data: { groupId: group.id, userId: user.id } });
      }
      return { name: submittedName };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['groupMembers'] });
      queryClient.invalidateQueries({ queryKey: ['availableScopes'] });
      queryClient.invalidateQueries({ queryKey: ['groupAssignments'] });
      notifySuccess(localize('com_admin_toast_group_created', { name: data.name }));
      resetAndClose();
    },
    onError: (err: Error) => notifyError(err.message),
  });

  const doSubmit = () => {
    setError('');
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

  const addUser = (user: AdminUserSearchResult) => {
    setSelectedUsers((prev) => {
      if (prev.some((u) => u.id === user.id)) return prev;
      return [...prev, user];
    });
  };

  const removeUser = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetAndClose();
      }}
    >
      <Dialog.Content
        title={localize('com_admin_access_create_group')}
        showClose
        onClose={resetAndClose}
        className="max-w-2xl!"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as t.CreateGroupTab)}
            ariaLabel={localize('com_admin_access_create_group')}
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
                    htmlFor="create-group-name"
                    className="text-sm font-medium text-(--cui-color-text-default)"
                  >
                    {localize('com_admin_access_col_name')}
                  </label>
                  <input
                    id="create-group-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={localize('com_admin_access_group_name_placeholder')}
                    className="rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-default) px-3 py-2 text-sm text-(--cui-color-text-default) placeholder:text-(--cui-color-text-disabled)"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="create-group-description"
                    className="text-sm font-medium text-(--cui-color-text-default)"
                  >
                    {localize('com_admin_config_field_description')}
                  </label>
                  <input
                    id="create-group-description"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={localize('com_admin_access_group_desc_placeholder')}
                    className="rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-default) px-3 py-2 text-sm text-(--cui-color-text-default) placeholder:text-(--cui-color-text-disabled)"
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
                <UserSearchInline
                  existingIds={selectedUsers.map((u) => u.id)}
                  onAdd={addUser}
                  listboxId="create-group-member-results"
                  disabled={mutation.isPending}
                />
                <SelectedMemberList
                  users={selectedUsers}
                  onRemove={removeUser}
                  disabled={mutation.isPending}
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
              onClick={resetAndClose}
              disabled={mutation.isPending}
            />
            <Button
              htmlType="submit"
              type="primary"
              label={localize('com_admin_access_create_group')}
              disabled={!name.trim() || mutation.isPending}
            />
          </div>
        </form>
      </Dialog.Content>
    </Dialog>
  );
}
