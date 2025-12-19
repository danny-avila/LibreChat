/* Memories */
import { useMemo, useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Trans } from 'react-i18next';
import { matchSorter } from 'match-sorter';
import { SystemRoles, PermissionTypes, Permissions } from 'librechat-data-provider';
import {
  Table,
  Input,
  Label,
  Button,
  Switch,
  Spinner,
  TableRow,
  OGDialog,
  EditIcon,
  TableHead,
  TableBody,
  TrashIcon,
  TableCell,
  TableHeader,
  TooltipAnchor,
  useToastContext,
  OGDialogTrigger,
  OGDialogTemplate,
} from '@librechat/client';
import type { TUserMemory } from 'librechat-data-provider';
import {
  useUpdateMemoryPreferencesMutation,
  useDeleteMemoryMutation,
  useMemoriesQuery,
  useGetUserQuery,
} from '~/data-provider';
import { useLocalize, useAuthContext, useHasAccess } from '~/hooks';
import MemoryCreateDialog from './MemoryCreateDialog';
import MemoryEditDialog from './MemoryEditDialog';
import AdminSettings from './AdminSettings';
import { cn } from '~/utils';

const EditMemoryButton = ({ memory }: { memory: TUserMemory }) => {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  return (
    <MemoryEditDialog
      open={open}
      memory={memory}
      onOpenChange={setOpen}
      triggerRef={triggerRef as React.MutableRefObject<HTMLButtonElement | null>}
    >
      <OGDialogTrigger asChild>
        <TooltipAnchor
          description={localize('com_ui_edit_memory')}
          render={
            <Button
              variant="ghost"
              aria-label={localize('com_ui_bookmarks_edit')}
              onClick={() => setOpen(!open)}
              className="h-8 w-8 p-0"
            >
              <EditIcon />
            </Button>
          }
        />
      </OGDialogTrigger>
    </MemoryEditDialog>
  );
};

const DeleteMemoryButton = ({ memory }: { memory: TUserMemory }) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [open, setOpen] = useState(false);
  const { mutate: deleteMemory } = useDeleteMemoryMutation();
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const confirmDelete = async () => {
    setDeletingKey(memory.key);
    deleteMemory(memory.key, {
      onSuccess: () => {
        showToast({
          message: localize('com_ui_deleted'),
          status: 'success',
        });
        setOpen(false);
      },
      onError: () =>
        showToast({
          message: localize('com_ui_error'),
          status: 'error',
        }),
      onSettled: () => setDeletingKey(null),
    });
  };

  return (
    <OGDialog open={open} onOpenChange={setOpen}>
      <OGDialogTrigger asChild>
        <TooltipAnchor
          description={localize('com_ui_delete_memory')}
          render={
            <Button
              variant="ghost"
              aria-label={localize('com_ui_delete')}
              onClick={() => setOpen(!open)}
              className="h-8 w-8 p-0"
            >
              {deletingKey === memory.key ? (
                <Spinner className="size-4 animate-spin" />
              ) : (
                <TrashIcon className="size-4" />
              )}
            </Button>
          }
        />
      </OGDialogTrigger>
      <OGDialogTemplate
        showCloseButton={false}
        title={localize('com_ui_delete_memory')}
        className="w-11/12 max-w-lg"
        main={
          <Label className="text-left text-sm font-medium">
            <Trans
              i18nKey="com_ui_delete_confirm_strong"
              values={{ title: memory.key }}
              components={{ strong: <strong /> }}
            />
          </Label>
        }
        selection={{
          selectHandler: confirmDelete,
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
    </OGDialog>
  );
};

const pageSize = 10;
export default function MemoryViewer() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { data: userData } = useGetUserQuery();
  const { data: memData, isLoading } = useMemoriesQuery();
  const { showToast } = useToastContext();
  const [pageIndex, setPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [referenceSavedMemories, setReferenceSavedMemories] = useState(true);

  const updateMemoryPreferencesMutation = useUpdateMemoryPreferencesMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_preferences_updated'),
        status: 'success',
      });
    },
    onError: () => {
      showToast({
        message: localize('com_ui_error_updating_preferences'),
        status: 'error',
      });
      setReferenceSavedMemories((prev) => !prev);
    },
  });

  useEffect(() => {
    if (userData?.personalization?.memories !== undefined) {
      setReferenceSavedMemories(userData.personalization.memories);
    }
  }, [userData?.personalization?.memories]);

  const handleMemoryToggle = (checked: boolean) => {
    setReferenceSavedMemories(checked);
    updateMemoryPreferencesMutation.mutate({ memories: checked });
  };

  const hasReadAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.READ,
  });

  const hasUpdateAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.UPDATE,
  });

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.CREATE,
  });

  const hasOptOutAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.OPT_OUT,
  });

  const memories: TUserMemory[] = useMemo(() => memData?.memories ?? [], [memData]);

  const filteredMemories = useMemo(() => {
    return matchSorter(memories, searchQuery, {
      keys: ['key', 'value'],
    });
  }, [memories, searchQuery]);

  const currentRows = useMemo(() => {
    return filteredMemories.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [filteredMemories, pageIndex]);

  const getProgressBarColor = (percentage: number): string => {
    if (percentage > 90) {
      return 'stroke-red-500';
    }
    if (percentage > 75) {
      return 'stroke-yellow-500';
    }
    return 'stroke-green-500';
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <Spinner />
      </div>
    );
  }

  if (!hasReadAccess) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <div className="text-center">
          <p className="text-sm text-text-secondary">{localize('com_ui_no_read_access')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div role="region" aria-label={localize('com_ui_memories')} className="mt-2 space-y-2">
        <div className="relative">
          <Input
            id="memory-search"
            placeholder=" "
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={localize('com_ui_memories_filter')}
            className="peer"
          />
          <Label
            htmlFor="memory-search"
            className="pointer-events-none absolute -top-1 left-3 w-auto origin-[0] translate-y-3 scale-100 rounded bg-background px-1 text-base text-text-secondary transition-transform duration-200 peer-placeholder-shown:translate-y-3 peer-placeholder-shown:scale-100 peer-focus:-translate-y-2 peer-focus:scale-75 peer-focus:text-text-primary peer-[:not(:placeholder-shown)]:-translate-y-2 peer-[:not(:placeholder-shown)]:scale-75"
          >
            {localize('com_ui_memories_filter')}
          </Label>
        </div>
        {/* Memory Usage and Toggle Display */}
        {(memData?.tokenLimit || hasOptOutAccess) && (
          <div
            className={cn(
              'flex items-center rounded-lg',
              memData?.tokenLimit != null && hasOptOutAccess ? 'justify-between' : 'justify-end',
            )}
          >
            {/* Usage Display */}
            {memData?.tokenLimit && (
              <div className="flex items-center gap-2">
                <div className="relative size-10">
                  <svg className="size-10 -rotate-90 transform">
                    <circle
                      cx="20"
                      cy="20"
                      r="16"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="none"
                      className="text-gray-200 dark:text-gray-700"
                    />
                    <circle
                      cx="20"
                      cy="20"
                      r="16"
                      strokeWidth="3"
                      fill="none"
                      strokeDasharray={`${2 * Math.PI * 16}`}
                      strokeDashoffset={`${2 * Math.PI * 16 * (1 - (memData.usagePercentage ?? 0) / 100)}`}
                      className={`transition-all ${getProgressBarColor(memData.usagePercentage ?? 0)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-medium">{memData.usagePercentage}%</span>
                  </div>
                </div>
                <div className="text-sm text-text-secondary">{localize('com_ui_usage')}</div>
              </div>
            )}

            {/* Memory Toggle */}
            {hasOptOutAccess && (
              <div className="flex items-center gap-2 text-xs">
                <span>{localize('com_ui_use_memory')}</span>
                <Switch
                  checked={referenceSavedMemories}
                  onCheckedChange={handleMemoryToggle}
                  aria-label={localize('com_ui_use_memory')}
                  disabled={updateMemoryPreferencesMutation.isLoading}
                />
              </div>
            )}
          </div>
        )}
        {/* Create Memory Button */}
        {hasCreateAccess && (
          <div className="flex w-full justify-end">
            <MemoryCreateDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <OGDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full bg-transparent"
                  aria-label={localize('com_ui_create_memory')}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {localize('com_ui_create_memory')}
                </Button>
              </OGDialogTrigger>
            </MemoryCreateDialog>
          </div>
        )}
        <div className="rounded-lg border border-border-light bg-transparent shadow-sm transition-colors">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow className="border-b border-border-light hover:bg-surface-secondary">
                <TableHead
                  className={`${
                    hasUpdateAccess ? 'w-[75%]' : 'w-[100%]'
                  } bg-surface-secondary py-3 text-left text-sm font-medium text-text-secondary`}
                >
                  <div>{localize('com_ui_memory')}</div>
                </TableHead>
                {hasUpdateAccess && (
                  <TableHead className="w-[25%] bg-surface-secondary py-3 text-center text-sm font-medium text-text-secondary">
                    <div>{localize('com_assistants_actions')}</div>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentRows.length ? (
                currentRows.map((memory: TUserMemory, idx: number) => (
                  <TableRow
                    key={idx}
                    className="border-b border-border-light hover:bg-surface-secondary"
                  >
                    <TableCell className={`${hasUpdateAccess ? 'w-[75%]' : 'w-[100%]'} px-4 py-4`}>
                      <div
                        className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-text-primary"
                        title={memory.value}
                      >
                        {memory.value}
                      </div>
                    </TableCell>
                    {hasUpdateAccess && (
                      <TableCell className="w-[25%] px-4 py-4">
                        <div className="flex justify-center gap-2">
                          <EditMemoryButton memory={memory} />
                          <DeleteMemoryButton memory={memory} />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={hasUpdateAccess ? 2 : 1}
                    className="h-24 text-center text-sm text-text-secondary"
                  >
                    {localize('com_ui_no_memories')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination controls */}
        {filteredMemories.length > pageSize && (
          <div
            className="flex items-center justify-end gap-2"
            role="navigation"
            aria-label="Pagination"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex((prev) => Math.max(prev - 1, 0))}
              disabled={pageIndex === 0}
              aria-label={localize('com_ui_prev')}
            >
              {localize('com_ui_prev')}
            </Button>
            <div className="text-sm" aria-live="polite">
              {`${pageIndex + 1} / ${Math.ceil(filteredMemories.length / pageSize)}`}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPageIndex((prev) =>
                  (prev + 1) * pageSize < filteredMemories.length ? prev + 1 : prev,
                )
              }
              disabled={(pageIndex + 1) * pageSize >= filteredMemories.length}
              aria-label={localize('com_ui_next')}
            >
              {localize('com_ui_next')}
            </Button>
          </div>
        )}

        {/* Admin Settings */}
        {user?.role === SystemRoles.ADMIN && (
          <div className="mt-4">
            <AdminSettings />
          </div>
        )}
      </div>
    </div>
  );
}
