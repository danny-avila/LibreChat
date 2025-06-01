/* Memories */
import { useMemo, useState } from 'react';
import { matchSorter } from 'match-sorter';
import { SystemRoles } from 'librechat-data-provider';
import type { TUserMemory } from 'librechat-data-provider';
import {
  Table,
  Input,
  Label,
  Button,
  TableRow,
  OGDialog,
  TableHead,
  TableBody,
  TableCell,
  TableHeader,
  TooltipAnchor,
  OGDialogTrigger,
} from '~/components/ui';
import { useDeleteMemoryMutation, useMemoriesQuery } from '~/data-provider';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { EditIcon, TrashIcon } from '~/components/svg';
import { useLocalize, useAuthContext } from '~/hooks';
import MemoryEditDialog from './MemoryEditDialog';
import Spinner from '~/components/svg/Spinner';
import { useToastContext } from '~/Providers';
import AdminSettings from './AdminSettings';

export default function MemoryViewer() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { data: memData = [], isLoading } = useMemoriesQuery();
  const { mutate: deleteMemory } = useDeleteMemoryMutation();
  const { showToast } = useToastContext();
  const [pageIndex, setPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 10;
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const memories: TUserMemory[] = useMemo(
    () =>
      Array.isArray(memData)
        ? memData
        : ((memData as unknown as { memories?: TUserMemory[] })?.memories ?? []),
    [memData],
  );

  const filteredMemories = useMemo(() => {
    return matchSorter(memories, searchQuery, {
      keys: ['key', 'value'],
    });
  }, [memories, searchQuery]);

  const currentRows = useMemo(() => {
    return filteredMemories.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [filteredMemories, pageIndex]);

  const EditMemoryButton = ({ memory }: { memory: TUserMemory }) => {
    const [open, setOpen] = useState(false);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setOpen(!open);
      }
    };

    return (
      <MemoryEditDialog memory={memory} open={open} onOpenChange={setOpen}>
        <OGDialogTrigger asChild>
          <TooltipAnchor
            role="button"
            aria-label={localize('com_ui_edit')}
            description={localize('com_ui_edit')}
            tabIndex={0}
            onClick={() => setOpen(!open)}
            className="flex size-7 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
            onKeyDown={handleKeyDown}
          >
            <EditIcon />
          </TooltipAnchor>
        </OGDialogTrigger>
      </MemoryEditDialog>
    );
  };

  const DeleteMemoryButton = ({ memory }: { memory: TUserMemory }) => {
    const [open, setOpen] = useState(false);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(!open);
      }
    };

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
            role="button"
            aria-label={localize('com_ui_delete')}
            description={localize('com_ui_delete')}
            className="flex size-7 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
            tabIndex={0}
            onClick={() => setOpen(!open)}
            onKeyDown={handleKeyDown}
          >
            {deletingKey === memory.key ? (
              <Spinner className="size-4 animate-spin" />
            ) : (
              <TrashIcon className="size-4" />
            )}
          </TooltipAnchor>
        </OGDialogTrigger>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_delete_memory')}
          className="w-11/12 max-w-lg"
          main={
            <Label className="text-left text-sm font-medium">
              {localize('com_ui_delete_confirm')} &quot;{memory.key}&quot;?
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

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div role="region" aria-label={localize('com_ui_memories')} className="mt-2 space-y-2">
        <div className="flex items-center gap-4">
          <Input
            placeholder={localize('com_ui_memories_filter')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={localize('com_ui_memories_filter')}
          />
        </div>

        <div className="rounded-lg border border-border-light bg-transparent shadow-sm transition-colors">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow className="border-b border-border-light">
                <TableHead className="w-[30%] bg-surface-secondary py-3 text-left text-sm font-medium text-text-secondary">
                  <div className="px-4">{localize('com_ui_key')}</div>
                </TableHead>
                <TableHead className="w-[40%] bg-surface-secondary py-3 text-left text-sm font-medium text-text-secondary">
                  <div className="px-4">{localize('com_ui_value')}</div>
                </TableHead>
                <TableHead className="w-[30%] bg-surface-secondary py-3 text-left text-sm font-medium text-text-secondary">
                  <div className="px-4">{localize('com_assistants_actions')}</div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentRows.length ? (
                currentRows.map((memory: TUserMemory, idx: number) => (
                  <TableRow
                    key={idx}
                    className="border-b border-border-light hover:bg-surface-hover"
                  >
                    <TableCell className="w-[30%] px-4 py-4">
                      <div
                        className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-text-primary"
                        title={memory.key}
                      >
                        {memory.key}
                      </div>
                    </TableCell>
                    <TableCell className="w-[40%] px-4 py-4">
                      <div
                        className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-text-primary"
                        title={memory.value}
                      >
                        {memory.value}
                      </div>
                    </TableCell>
                    <TableCell className="w-[30%] px-4 py-4">
                      <div className="flex gap-2">
                        <EditMemoryButton memory={memory} />
                        <DeleteMemoryButton memory={memory} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-sm text-text-secondary">
                    {localize('com_ui_no_data')}
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
