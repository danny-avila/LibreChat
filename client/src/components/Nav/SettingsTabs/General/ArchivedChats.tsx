import { useState, useCallback, useMemo, useEffect } from 'react';
import { TrashIcon, ArchiveRestore } from 'lucide-react';
import type { SortingState } from '@tanstack/react-table';
import {
  Button,
  OGDialog,
  OGDialogTrigger,
  OGDialogTemplate,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Label,
  TooltipAnchor,
  Spinner,
  useToastContext,
  useMediaQuery,
  DataTable,
  type TableColumn,
} from '@librechat/client';
import type { ConversationListParams, TConversation } from 'librechat-data-provider';
import {
  useArchiveConvoMutation,
  useConversationsInfiniteQuery,
  useDeleteConversationMutation,
} from '~/data-provider';
import { MinimalIcon } from '~/components/Endpoints';
import { NotificationSeverity } from '~/common';
import { formatDate, cn } from '~/utils';
import { useLocalize } from '~/hooks';

const DEFAULT_PARAMS = {
  isArchived: true,
  sortBy: 'createdAt',
  sortDirection: 'desc',
  search: '',
} as const satisfies ConversationListParams;

type SortKey = 'createdAt' | 'title';
const isSortKey = (v: string): v is SortKey => v === 'createdAt' || v === 'title';

const defaultSort: SortingState = [
  {
    id: 'createdAt',
    desc: true,
  },
];

export default function ArchivedChatsTable() {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { showToast } = useToastContext();

  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState<TConversation | null>(null);
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);

  const [queryParams, setQueryParams] = useState<ConversationListParams>(DEFAULT_PARAMS);
  const [sorting, setSorting] = useState<SortingState>(defaultSort);
  const [searchValue, setSearchValue] = useState('');

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching, refetch, isLoading } =
    useConversationsInfiniteQuery(queryParams, {
      enabled: isOpen,
      keepPreviousData: true,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    });

  const [allKnownConversations, setAllKnownConversations] = useState<TConversation[]>([]);

  const handleSearchChange = useCallback((value: string) => {
    const trimmedValue = value.trim();
    setSearchValue(trimmedValue);
    setAllKnownConversations([]);
    setQueryParams((prev) => ({
      ...prev,
      search: trimmedValue,
    }));
  }, []);

  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      setSorting((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;

        const coerced = next;
        const primary = coerced[0];

        // Seed allKnown with current data before changing params
        if (data?.pages) {
          const currentFlattened = data.pages.flatMap(
            (page) => page?.conversations?.filter(Boolean) ?? [],
          );
          setAllKnownConversations(currentFlattened);
        }

        setQueryParams((p) => {
          let sortBy: SortKey;
          let sortDirection: 'asc' | 'desc';

          if (primary && isSortKey(primary.id)) {
            sortBy = primary.id;
            sortDirection = primary.desc ? 'desc' : 'asc';
          } else {
            sortBy = 'createdAt';
            sortDirection = 'desc';
          }

          const newParams = {
            ...p,
            sortBy,
            sortDirection,
          };

          return newParams;
        });

        return coerced;
      });
    },
    [setQueryParams, data?.pages],
  );

  const handleError = useCallback(
    (error: Error) => {
      console.error('DataTable error:', error);
      showToast({
        message: localize('com_ui_unarchive_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
    [showToast, localize],
  );

  useEffect(() => {
    if (!data?.pages) return;

    const newFlattened = data.pages.flatMap((page) => page?.conversations?.filter(Boolean) ?? []);

    const toAdd = newFlattened.filter(
      (convo: TConversation) =>
        !allKnownConversations.some((known) => known.conversationId === convo.conversationId),
    );

    if (toAdd.length > 0) {
      setAllKnownConversations((prev) => [...prev, ...toAdd]);
    }
  }, [data?.pages]);

  const displayData = useMemo(() => {
    const primary = sorting[0];
    if (!primary || allKnownConversations.length === 0) return allKnownConversations;

    return [...allKnownConversations].sort((a: TConversation, b: TConversation) => {
      let compare: number;
      if (primary.id === 'createdAt') {
        const aDate = new Date(a.createdAt || 0);
        const bDate = new Date(b.createdAt || 0);
        compare = aDate.getTime() - bDate.getTime();
      } else if (primary.id === 'title') {
        compare = (a.title || '').localeCompare(b.title || '');
      } else {
        return 0;
      }
      return primary.desc ? -compare : compare;
    });
  }, [allKnownConversations, sorting]);

  const unarchiveMutation = useArchiveConvoMutation({
    onSuccess: (data, variables) => {
      const { conversationId } = variables;
      setAllKnownConversations((prev) => prev.filter((c) => c.conversationId !== conversationId));
      refetch();
    },
    onError: () => {
      showToast({
        message: localize('com_ui_unarchive_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const deleteMutation = useDeleteConversationMutation({
    onSuccess: (data, variables) => {
      const { conversationId } = variables;
      setAllKnownConversations((prev) => prev.filter((c) => c.conversationId !== conversationId));
      showToast({
        message: localize('com_ui_archived_conversation_delete_success'),
        severity: NotificationSeverity.SUCCESS,
      });
      setIsDeleteOpen(false);
      refetch();
    },
    onError: () => {
      showToast({
        message: localize('com_ui_archive_delete_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const handleFetchNextPage = useCallback(async () => {
    if (!hasNextPage || isFetchingNextPage) return;
    await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const effectiveIsLoading = isLoading && displayData.length === 0;
  const effectiveIsFetching = isFetchingNextPage;

  const confirmDelete = useCallback(() => {
    if (!deleteRow?.conversationId) {
      showToast({
        message: localize('com_ui_convo_delete_error'),
        severity: NotificationSeverity.WARNING,
      });
      return;
    }
    deleteMutation.mutate({ conversationId: deleteRow.conversationId });
  }, [deleteMutation, deleteRow, localize, showToast]);

  const handleUnarchive = useCallback(
    (conversationId: string) => {
      setUnarchivingId(conversationId);
      unarchiveMutation.mutate(
        { conversationId, isArchived: false },
        { onSettled: () => setUnarchivingId(null) },
      );
    },
    [unarchiveMutation],
  );

  const columns: TableColumn<Record<string, unknown>, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'title',
        accessorFn: (row: Record<string, unknown>): unknown => {
          const convo = row as TConversation;
          return convo.title;
        },
        header: () => (
          <span className="text-xs text-text-primary sm:text-sm">
            {localize('com_nav_archive_name')}
          </span>
        ),
        cell: ({ row }) => {
          const convo = row.original as TConversation;
          const { conversationId, title } = convo;
          return (
            <div className="flex items-center gap-2">
              <MinimalIcon
                endpoint={convo.endpoint}
                size={28}
                isCreatedByUser={false}
                iconClassName="size-4"
                aria-hidden="true"
              />
              <a
                href={`/c/${conversationId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center truncate underline"
                aria-label={localize('com_ui_open_conversation', { 0: title })}
              >
                {title}
              </a>
            </div>
          );
        },
        meta: {
          className: 'min-w-[150px] flex-1',
        },
        enableSorting: true,
      },
      {
        accessorKey: 'createdAt',
        accessorFn: (row: Record<string, unknown>): unknown => {
          const convo = row as TConversation;
          return convo.createdAt;
        },
        header: () => (
          <span className="text-xs text-text-primary sm:text-sm">
            {localize('com_nav_archive_created_at')}
          </span>
        ),
        cell: ({ row }) => {
          const convo = row.original as TConversation;
          return formatDate(convo.createdAt?.toString() ?? '', isSmallScreen);
        },
        meta: {
          className: 'w-32 sm:w-40',
          // desktopOnly: true, // WIP
        },
        enableSorting: true,
      },
      {
        id: 'actions',
        accessorFn: (row: Record<string, unknown>): unknown => null,
        header: () => (
          <span className="text-xs text-text-primary sm:text-sm">
            {localize('com_assistants_actions')}
          </span>
        ),
        cell: ({ row }) => {
          const convo = row.original as TConversation;
          const { title } = convo;
          const isRowUnarchiving = unarchivingId === convo.conversationId;

          return (
            <div className="flex items-center gap-2">
              <TooltipAnchor
                description={localize('com_ui_unarchive')}
                render={
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 hover:bg-surface-hover"
                    onClick={() => {
                      const conversationId = convo.conversationId;
                      if (!conversationId) return;
                      handleUnarchive(conversationId);
                    }}
                    disabled={isRowUnarchiving}
                    aria-label={localize('com_ui_unarchive_conversation_title', { 0: title })}
                  >
                    {isRowUnarchiving ? <Spinner /> : <ArchiveRestore className="size-4" />}
                  </Button>
                }
              />
              <TooltipAnchor
                description={localize('com_ui_delete')}
                render={
                  <Button
                    variant="destructive"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                      setDeleteRow(convo);
                      setIsDeleteOpen(true);
                    }}
                    aria-label={localize('com_ui_delete_conversation_title', { 0: title })}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                }
              />
            </div>
          );
        },
        meta: {
          className: 'w-24',
        },
        enableSorting: false,
      },
    ],
    [isSmallScreen, localize, handleUnarchive, unarchivingId],
  );

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_archived_chats')}</div>
      <OGDialog open={isOpen} onOpenChange={setIsOpen}>
        <OGDialogTrigger asChild>
          <Button variant="outline" aria-label="Archived chats">
            {localize('com_ui_manage')}
          </Button>
        </OGDialogTrigger>
        <OGDialogContent className={cn('w-11/12 max-w-6xl', isSmallScreen && 'px-1 pb-1')}>
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_nav_archived_chats')}</OGDialogTitle>
          </OGDialogHeader>
          <DataTable
            columns={columns}
            data={displayData}
            isLoading={effectiveIsLoading}
            isFetching={effectiveIsFetching}
            config={{
              skeleton: { count: 11 },
              search: {
                filterColumn: 'title',
                enableSearch: true,
                debounce: 300,
              },
              selection: {
                enableRowSelection: true,
                showCheckboxes: true,
              },
            }}
            filterValue={searchValue}
            onFilterChange={handleSearchChange}
            fetchNextPage={handleFetchNextPage}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            sorting={sorting}
            onSortingChange={handleSortingChange}
            onError={handleError}
          />
        </OGDialogContent>
      </OGDialog>
      <OGDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_delete_archived_chats')}
          className="w-11/12 max-w-md"
          main={
            <div className="flex w-full flex-col items-center gap-2">
              <div className="grid w-full items-center gap-2">
                <Label className="text-left text-sm font-medium">
                  {localize('com_ui_delete_confirm')} <strong>{deleteRow?.title}</strong>
                </Label>
              </div>
            </div>
          }
          selection={{
            selectHandler: confirmDelete,
            selectClasses: `bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white ${
              deleteMutation.isLoading ? 'cursor-not-allowed opacity-80' : ''
            }`,
            selectText: deleteMutation.isLoading ? <Spinner /> : localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </div>
  );
}
