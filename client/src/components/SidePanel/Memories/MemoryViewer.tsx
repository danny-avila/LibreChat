/* Memories */
import { useMemo, useState } from 'react';
import { Pencil, Trash2, X, Check, RefreshCw } from 'lucide-react';
import type { TUserMemory } from 'librechat-data-provider';
import {
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
  Button,
  Table,
  Input,
} from '~/components/ui';
import {
  useDeleteMemoryMutation,
  useUpdateMemoryMutation,
  useMemoriesQuery,
} from '~/data-provider';
import Spinner from '~/components/svg/Spinner';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';

export default function MemoryViewer() {
  const localize = useLocalize();
  const {
    data: memData = [],
    isLoading,
    isFetching,
    refetch: refreshMemories,
  } = useMemoriesQuery();
  const { mutate: deleteMemory } = useDeleteMemoryMutation();
  const { mutate: updateMemory } = useUpdateMemoryMutation();
  const { showToast } = useToastContext();
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 10;
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  // Track in-flight mutations for UX feedback and to disable double-clicks
  const [savingKey, setSavingKey] = useState<string | null>(null);
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

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mt-1 space-y-2" role="region" aria-label={localize('com_ui_memories')}>
      <div className="rounded-lg border border-border-light bg-transparent shadow-sm transition-colors">
        <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary px-3 py-1">
          <h2 className="text-sm font-medium text-text-primary">{localize('com_ui_memories')}</h2>
          <Button
            size="icon"
            variant="ghost"
            aria-label={localize('com_ui_refresh_link')}
            onClick={() => refreshMemories()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Spinner className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>
        </div>
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow className="border-b border-border-light">
              <TableHead className="w-[30%] bg-surface-secondary py-3 text-left text-sm font-medium text-text-secondary">
                <div className="px-4">{localize('com_ui_key')}</div>
              </TableHead>
              <TableHead className="w-[50%] bg-surface-secondary py-3 text-left text-sm font-medium text-text-secondary">
                <div className="px-4">{localize('com_ui_value')}</div>
              </TableHead>
              <TableHead className="w-[20%] bg-surface-secondary py-3 text-left text-sm font-medium text-text-secondary">
                <div className="px-4">{localize('com_ui_date')}</div>
              </TableHead>
              <TableHead className="w-[10%] bg-surface-secondary py-3 text-left text-sm font-medium text-text-secondary">
                <div className="px-4">{localize('com_assistants_actions')}</div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentRows.length ? (
              currentRows.map((memory: TUserMemory, idx: number) => {
                const isEditing = editingKey === memory.key;
                return (
                  <TableRow key={idx} className="border-b border-border-light">
                    <TableCell className="truncate px-4 py-3 text-sm text-text-primary">
                      {memory.key}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-text-primary">
                      {isEditing ? (
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (editValue.trim() === '') {
                                showToast({
                                  message: localize('com_ui_field_required'),
                                  status: 'error',
                                });
                                return;
                              }
                              setSavingKey(memory.key);
                              updateMemory(
                                { key: memory.key, value: editValue },
                                {
                                  onSuccess: () => {
                                    showToast({
                                      message: localize('com_ui_saved'),
                                      status: 'success',
                                    });
                                    setEditingKey(null);
                                  },
                                  onError: () => {
                                    showToast({
                                      message: localize('com_ui_error'),
                                      status: 'error',
                                    });
                                  },
                                  onSettled: () => setSavingKey(null),
                                },
                              );
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditingKey(null);
                            }
                          }}
                          className="w-full"
                          aria-label={localize('com_ui_edit')}
                        />
                      ) : (
                        <span className="inline-block max-w-full truncate">{memory.value}</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-text-secondary">
                      {new Date(memory.updated_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="flex gap-2 px-4 py-3">
                      {isEditing ? (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={localize('com_ui_save')}
                            disabled={savingKey === memory.key}
                            onClick={() => {
                              if (editValue.trim() === '') {
                                showToast({
                                  message: localize('com_ui_field_required'),
                                  status: 'error',
                                });
                                return;
                              }
                              setSavingKey(memory.key);
                              updateMemory(
                                { key: memory.key, value: editValue },
                                {
                                  onSuccess: () => {
                                    showToast({
                                      message: localize('com_ui_saved'),
                                      status: 'success',
                                    });
                                    setEditingKey(null);
                                  },
                                  onError: () =>
                                    showToast({
                                      message: localize('com_ui_error'),
                                      status: 'error',
                                    }),
                                  onSettled: () => setSavingKey(null),
                                },
                              );
                            }}
                          >
                            {savingKey === memory.key ? (
                              <Spinner className="size-4 animate-spin" />
                            ) : (
                              <Check className="size-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={localize('com_ui_cancel')}
                            onClick={() => setEditingKey(null)}
                          >
                            <X className="size-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={localize('com_ui_edit')}
                            onClick={() => {
                              setEditingKey(memory.key);
                              setEditValue(memory.value);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={localize('com_ui_delete')}
                            onClick={() => {
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
                            }}
                          >
                            {deletingKey === memory.key ? (
                              <Spinner className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-sm text-text-secondary">
                  {localize('com_ui_no_data')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Simple pagination controls */}
      {memories.length > pageSize && (
        <div
          className="flex items-center justify-end gap-2"
          role="navigation"
          aria-label="Pagination"
        >
          <button
            className="text-sm disabled:opacity-50"
            onClick={() => setPageIndex((prev) => Math.max(prev - 1, 0))}
            disabled={pageIndex === 0}
          >
            {localize('com_ui_prev')}
          </button>
          <div className="text-sm" aria-live="polite">
            {`${pageIndex + 1} / ${Math.ceil(memories.length / pageSize)}`}
          </div>
          <button
            className="text-sm disabled:opacity-50"
            onClick={() =>
              setPageIndex((prev) => ((prev + 1) * pageSize < memories.length ? prev + 1 : prev))
            }
            disabled={(pageIndex + 1) * pageSize >= memories.length}
          >
            {localize('com_ui_next')}
          </button>
        </div>
      )}
    </div>
  );
}
