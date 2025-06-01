/* Memories */
import { useMemo, useState } from 'react';
import { SystemRoles } from 'librechat-data-provider';
import { Pencil, Trash2, RefreshCw } from 'lucide-react';
import type { TUserMemory } from 'librechat-data-provider';
import {
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
  Button,
  Table,
} from '~/components/ui';
import { useDeleteMemoryMutation, useMemoriesQuery } from '~/data-provider';
import { useLocalize, useAuthContext } from '~/hooks';
import MemoryEditDialog from './MemoryEditDialog';
import Spinner from '~/components/svg/Spinner';
import { useToastContext } from '~/Providers';
import AdminSettings from './AdminSettings';

export default function MemoryViewer() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const {
    data: memData = [],
    isLoading,
    // isFetching,
    // refetch: refreshMemories,
  } = useMemoriesQuery();
  const { mutate: deleteMemory } = useDeleteMemoryMutation();
  const { showToast } = useToastContext();
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 10;
  const [selectedMemory, setSelectedMemory] = useState<TUserMemory | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const memories: TUserMemory[] = useMemo(
    () =>
      Array.isArray(memData)
        ? memData
        : ((memData as unknown as { memories?: TUserMemory[] })?.memories ?? []),
    [memData],
  );

  const currentRows = useMemo(() => {
    return memories.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [memories, pageIndex]);

  const handleEdit = (memory: TUserMemory) => {
    setSelectedMemory(memory);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (memory: TUserMemory) => {
    if (window.confirm(localize('com_ui_delete_confirm'))) {
      setDeletingKey(memory.key);
      deleteMemory(memory.key, {
        onSuccess: () =>
          showToast({
            message: localize('com_ui_deleted'),
            status: 'success',
          }),
        onError: () =>
          showToast({
            message: localize('com_ui_error'),
            status: 'error',
          }),
        onSettled: () => setDeletingKey(null),
      });
    }
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
      {/* 
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-light bg-surface-primary p-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-text-primary">
            {localize('com_ui_memories')} ({memories.length})
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refreshMemories()}
            disabled={isFetching}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
       */}

      <div className="mt-2 space-y-2" role="region" aria-label={localize('com_ui_memories')}>
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
                    <TableCell className="w-[30%] px-4 py-3">
                      <div
                        className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-text-primary"
                        title={memory.key}
                      >
                        {memory.key}
                      </div>
                    </TableCell>
                    <TableCell className="w-[40%] px-4 py-3">
                      <div
                        className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-text-primary"
                        title={memory.value}
                      >
                        {memory.value}
                      </div>
                    </TableCell>
                    <TableCell className="w-[30%] px-4 py-3">
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label={localize('com_ui_edit')}
                          onClick={() => handleEdit(memory)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label={localize('com_ui_delete')}
                          onClick={() => handleDelete(memory)}
                          disabled={deletingKey === memory.key}
                        >
                          {deletingKey === memory.key ? (
                            <Spinner className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </Button>
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
        {memories.length > pageSize && (
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
              {`${pageIndex + 1} / ${Math.ceil(memories.length / pageSize)}`}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPageIndex((prev) => ((prev + 1) * pageSize < memories.length ? prev + 1 : prev))
              }
              disabled={(pageIndex + 1) * pageSize >= memories.length}
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

        <MemoryEditDialog
          memory={selectedMemory}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
        />
      </div>
    </div>
  );
}
