import { useCallback, useState, useMemo } from 'react';
import { Trans } from 'react-i18next';
import { ChevronDown, ChevronRight, TrashIcon, UserPlus, X } from 'lucide-react';
import {
  Input,
  Label,
  Button,
  Spinner,
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogTrigger,
  OGDialogContent,
  useToastContext,
  OGDialogTemplate,
} from '@librechat/client';
import type { TAdminGroup } from 'librechat-data-provider';
import {
  useAdminGroupsQuery,
  useCreateAdminGroupMutation,
  useDeleteAdminGroupMutation,
  useAdminGroupMembersQuery,
  useSearchAdminUsersQuery,
  useAddAdminGroupMemberMutation,
  useRemoveAdminGroupMemberMutation,
} from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';

function GroupMembers({ group }: { group: TAdminGroup }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [query, setQuery] = useState('');
  const { data: membersData, isLoading: membersLoading } = useAdminGroupMembersQuery(group._id);
  const { data: searchResults, isLoading: searchLoading } = useSearchAdminUsersQuery(query);

  const addMember = useAddAdminGroupMemberMutation({
    onSuccess: () => setQuery(''),
    onError: () =>
      showToast({
        message: localize('com_ui_group_add_member_error'),
        severity: NotificationSeverity.ERROR,
      }),
  });
  const removeMember = useRemoveAdminGroupMemberMutation({
    onError: () =>
      showToast({
        message: localize('com_ui_group_remove_member_error'),
        severity: NotificationSeverity.ERROR,
      }),
  });

  const existingIds = useMemo(
    () => new Set((membersData?.members ?? []).map((m) => m.userId)),
    [membersData],
  );
  const addableResults = useMemo(
    () => (searchResults ?? []).filter((u) => !existingIds.has(u.id)),
    [searchResults, existingIds],
  );

  return (
    <div className="space-y-2 border-t border-border-light pt-2">
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={localize('com_ui_group_add_member_placeholder')}
          className="h-8 w-full text-sm"
        />
        {query.trim().length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-border-light bg-surface-primary shadow-lg">
            {searchLoading && (
              <div className="p-2">
                <Spinner className="h-4 w-4" />
              </div>
            )}
            {!searchLoading && addableResults.length === 0 && (
              <div className="p-2 text-xs text-text-secondary">
                {localize('com_ui_group_no_users_found')}
              </div>
            )}
            {!searchLoading &&
              addableResults.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-surface-hover"
                  onClick={() => addMember.mutate({ id: group._id, userId: u.id })}
                >
                  <UserPlus className="size-3.5 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{u.name || u.email}</span>
                </button>
              ))}
          </div>
        )}
      </div>
      {membersLoading ? (
        <Spinner className="h-4 w-4" />
      ) : (
        <div className="space-y-1">
          {(membersData?.members ?? []).map((member) => (
            <div
              key={member.userId}
              className="flex items-center justify-between rounded-md bg-surface-secondary px-2 py-1"
            >
              <span className="truncate text-sm">{member.name || member.email}</span>
              <Button
                variant="ghost"
                className="h-6 w-6 p-0 hover:bg-surface-hover"
                aria-label={localize('com_ui_group_remove_member', { name: member.name })}
                onClick={() => removeMember.mutate({ id: group._id, userId: member.userId })}
              >
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
          {(membersData?.members ?? []).length === 0 && (
            <p className="text-xs text-text-secondary">{localize('com_ui_group_no_members')}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function GroupsPanel() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TAdminGroup | null>(null);

  const { data, isLoading } = useAdminGroupsQuery(undefined, { enabled: isOpen });

  const createGroup = useCreateAdminGroupMutation({
    onSuccess: () => {
      setName('');
      setDescription('');
      showToast({ message: localize('com_ui_group_created') });
    },
    onError: () =>
      showToast({
        message: localize('com_ui_group_create_error'),
        severity: NotificationSeverity.ERROR,
      }),
  });

  const deleteGroup = useDeleteAdminGroupMutation({
    onSuccess: () => {
      setIsDeleteOpen(false);
      setDeleteTarget(null);
      showToast({ message: localize('com_ui_group_deleted') });
    },
    onError: () =>
      showToast({
        message: localize('com_ui_group_delete_error'),
        severity: NotificationSeverity.ERROR,
      }),
  });

  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteGroup.mutate({ id: deleteTarget._id });
    }
  }, [deleteTarget, deleteGroup]);

  const groups = data?.groups ?? [];

  return (
    <div className="flex items-center justify-between">
      <Label id="groups-label">{localize('com_ui_groups')}</Label>

      <OGDialog open={isOpen} onOpenChange={setIsOpen}>
        <OGDialogTrigger asChild onClick={() => setIsOpen(true)}>
          <Button aria-labelledby="groups-label" variant="outline">
            {localize('com_ui_manage')}
          </Button>
        </OGDialogTrigger>

        <OGDialogContent
          title={localize('com_ui_groups')}
          className="w-11/12 max-w-2xl bg-background text-text-primary shadow-2xl"
        >
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_ui_groups')}</OGDialogTitle>
          </OGDialogHeader>

          <div className="space-y-3">
            <div role="region" aria-label={localize('com_ui_group_create')} className="space-y-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={localize('com_ui_group_name_placeholder')}
                className="h-9 w-full"
              />
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={localize('com_ui_group_description_placeholder')}
                className="h-9 w-full"
              />
              <Button
                size="sm"
                className="w-full"
                disabled={!name.trim() || createGroup.isLoading}
                onClick={() =>
                  createGroup.mutate({ name: name.trim(), description: description.trim() })
                }
              >
                {createGroup.isLoading ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  localize('com_ui_group_create_button')
                )}
              </Button>
            </div>

            {isLoading && <Spinner className="mx-auto h-5 w-5" />}
            {!isLoading && groups.length === 0 && (
              <p className="py-4 text-center text-sm text-text-secondary">
                {localize('com_ui_groups_empty')}
              </p>
            )}
            {!isLoading && groups.length > 0 && (
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {groups.map((group) => (
                  <div key={group._id} className="rounded-lg border border-border-light p-2">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => setExpandedId(expandedId === group._id ? null : group._id)}
                        aria-expanded={expandedId === group._id}
                      >
                        {expandedId === group._id ? (
                          <ChevronDown className="size-4 flex-shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="size-4 flex-shrink-0" aria-hidden="true" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{group.name}</div>
                          {group.description && (
                            <div className="truncate text-xs text-text-secondary">
                              {group.description}
                            </div>
                          )}
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        className="h-8 w-8 flex-shrink-0 p-0 hover:bg-surface-hover"
                        aria-label={localize('com_ui_group_delete', { name: group.name })}
                        onClick={() => {
                          setDeleteTarget(group);
                          setIsDeleteOpen(true);
                        }}
                      >
                        <TrashIcon className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                    {expandedId === group._id && <GroupMembers group={group} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </OGDialogContent>
      </OGDialog>

      <OGDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_group_delete_heading')}
          className="max-w-[450px]"
          main={
            <div id="delete-group-dialog" className="flex w-full flex-col items-center gap-2">
              <div className="grid w-full items-center gap-2">
                <Label
                  htmlFor="dialog-confirm-delete-group"
                  className="text-left text-sm font-medium"
                >
                  <Trans
                    i18nKey="com_ui_group_delete_confirm"
                    values={{ name: deleteTarget?.name }}
                    components={{ strong: <strong /> }}
                  />
                </Label>
              </div>
            </div>
          }
          selection={{
            selectHandler: confirmDelete,
            selectClasses: `bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white ${
              deleteGroup.isLoading ? 'cursor-not-allowed opacity-80' : ''
            }`,
            selectText: deleteGroup.isLoading ? <Spinner /> : localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </div>
  );
}
