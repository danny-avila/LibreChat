import { useState, useCallback, useMemo } from 'react';
import { TrashIcon, ArchiveRestore } from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
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
  DataTable,
  useToastContext,
  useMediaQuery,
} from '@librechat/client';
import type { ConversationListParams, TConversation } from 'librechat-data-provider';
import {
  useArchiveConvoMutation,
  useConversationsInfiniteQuery,
  useDeleteConversationMutation,
} from '~/data-provider';
import { MinimalIcon } from '~/components/Endpoints';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';
import { formatDate } from '~/utils';

const DEFAULT_PARAMS: ConversationListParams = {
  isArchived: true,
  sortBy: 'createdAt',
  sortDirection: 'desc',
  search: '',
};

const defaultSort: SortingState = [
  {
    id: 'createdAt',
    desc: true,
  },
];

// Define the table column type for better type safety
type TableColumn<TData, TValue> = ColumnDef<TData, TValue> & {
  meta?: {
    size?: string | number;
    mobileSize?: string | number;
    minWidth?: string | number;
  };
};

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

  const handleSearchChange = useCallback((value: string) => {
    const trimmedValue = value.trim();
    setSearchValue(trimmedValue);
    setQueryParams((prev) => ({
      ...prev,
      search: trimmedValue,
    }));
  }, []);

  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(newSorting);
      const sortDescriptor = newSorting[0];
      if (sortDescriptor) {
        setQueryParams((prev) => ({
          ...prev,
          sortBy: sortDescriptor.id as 'createdAt' | 'title',
          sortDirection: sortDescriptor.desc ? 'desc' : 'asc',
        }));
      } else {
        setQueryParams((prev) => ({
          ...prev,
          sortBy: 'createdAt',
          sortDirection: 'desc',
        }));
      }
    },
    [sorting],
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

  const allConversations = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page?.conversations?.filter(Boolean) ?? []);
  }, [data?.pages]);

  const unarchiveMutation = useArchiveConvoMutation({
    onSuccess: async () => {
      await refetch();
    },
    onError: () => {
      showToast({
        message: localize('com_ui_unarchive_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const deleteMutation = useDeleteConversationMutation({
    onSuccess: async () => {
      showToast({
        message: localize('com_ui_archived_conversation_delete_success'),
        severity: NotificationSeverity.SUCCESS,
      });
      setIsDeleteOpen(false);
      await refetch();
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

  const columns: TableColumn<TConversation, any>[] = useMemo(
    () => [
      {
        accessorKey: 'title',
        header: () => (
          <span className="text-xs sm:text-sm">{localize('com_nav_archive_name')}</span>
        ),
        cell: ({ row }) => {
          const { conversationId, title } = row.original;
          return (
            <a
              href={`/c/${conversationId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 truncate underline"
              aria-label={localize('com_ui_open_conversation', { 0: title })}
            >
              <MinimalIcon
                endpoint={row.original.endpoint}
                size={28}
                isCreatedByUser={false}
                iconClassName="size-4"
                aria-hidden="true"
              />
              <span>{title}</span>
            </a>
          );
        },
        meta: {
          size: isSmallScreen ? '70%' : '50%',
          mobileSize: '70%',
        },
        enableSorting: true,
      },
      {
        accessorKey: 'createdAt',
        header: () => (
          <span className="text-xs sm:text-sm">{localize('com_nav_archive_created_at')}</span>
        ),
        cell: ({ row }) => formatDate(row.original.createdAt?.toString() ?? '', isSmallScreen),
        meta: {
          size: isSmallScreen ? '30%' : '35%',
          mobileSize: '30%',
        },
        enableSorting: true,
      },
      {
        id: 'actions',
        header: () => (
          <Label className="px-2 py-0 text-xs sm:px-2 sm:py-2 sm:text-sm">
            {localize('com_assistants_actions')}
          </Label>
        ),
        cell: ({ row }) => {
          const conversation = row.original;
          const { title } = conversation;
          const isRowUnarchiving = unarchivingId === conversation.conversationId;

          return (
            <div className="flex items-center gap-2">
              <TooltipAnchor
                description={localize('com_ui_unarchive')}
                render={
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 hover:bg-surface-hover"
                    onClick={() => {
                      const conversationId = conversation.conversationId;
                      if (!conversationId) return;
                      setUnarchivingId(conversationId);
                      unarchiveMutation.mutate(
                        { conversationId, isArchived: false },
                        { onSettled: () => setUnarchivingId(null) },
                      );
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
                    variant="ghost"
                    className="h-8 w-8 p-0 hover:bg-surface-hover"
                    onClick={() => {
                      setDeleteRow(row.original);
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
          size: '15%',
          mobileSize: '25%',
        },
        enableSorting: false,
      },
    ],
    [isSmallScreen, localize, unarchiveMutation, unarchivingId],
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
        <OGDialogContent className="w-11/12 max-w-5xl">
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_nav_archived_chats')}</OGDialogTitle>
          </OGDialogHeader>
          <DataTable
            columns={columns}
            data={allConversations}
            isLoading={isLoading}
            isFetching={isFetching}
            config={{
              skeleton: { count: 10 },
              search: {
                filterColumn: 'title',
                enableSearch: true,
                debounce: 300,
              },
              selection: {
                enableRowSelection: false,
                showCheckboxes: false,
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
    </div>
  );
}
