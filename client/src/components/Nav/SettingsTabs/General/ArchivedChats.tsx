import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import debounce from 'lodash/debounce';
import { useRecoilValue } from 'recoil';
import { TrashIcon, ArchiveRestore } from 'lucide-react';
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
import store from '~/store';

const DEFAULT_PARAMS: ConversationListParams = {
  isArchived: true,
  sortBy: 'createdAt',
  sortDirection: 'desc',
  search: '',
};

type SortField = 'title' | 'createdAt';

export default function ArchivedChatsTable() {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { showToast } = useToastContext();
  const isSearchEnabled = useRecoilValue(store.search);

  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState<TConversation | null>(null);
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);
  const prevSortRef = useRef({
    sortBy: DEFAULT_PARAMS.sortBy,
    sortDirection: DEFAULT_PARAMS.sortDirection,
  });

  const [queryParams, setQueryParams] = useState<ConversationListParams>(DEFAULT_PARAMS);
  const [searchInput, setSearchInput] = useState('');

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isLoading } =
    useConversationsInfiniteQuery(queryParams, {
      enabled: isOpen,
      staleTime: 30 * 1000,
      cacheTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      keepPreviousData: false,
    });

  const handleSort = useCallback((field: string, direction: 'asc' | 'desc') => {
    setQueryParams((prev) => ({
      ...prev,
      sortBy: field as SortField,
      sortDirection: direction,
    }));
  }, []);

  // Trigger refetch when sort parameters change
  useEffect(() => {
    if (!isOpen) return; // Only refetch if dialog is open

    const { sortBy, sortDirection } = queryParams;
    const prevSort = prevSortRef.current;

    if (sortBy !== prevSort.sortBy || sortDirection !== prevSort.sortDirection) {
      console.log('Sort changed, refetching...', { from: prevSort, to: { sortBy, sortDirection } });
      refetch();
      prevSortRef.current = { sortBy, sortDirection };
    }
  }, [queryParams, isOpen, refetch]);

  const debouncedApplySearch = useMemo(
    () =>
      debounce((value: string) => {
        setQueryParams((prev) => ({
          ...prev,
          search: encodeURIComponent(value.trim()),
        }));
      }, 500), // Increased debounce time to 500ms for better UX
    [],
  );

  const onFilterChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      debouncedApplySearch(value);
    },
    [debouncedApplySearch],
  );

  useEffect(() => {
    return () => {
      debouncedApplySearch.cancel();
    };
  }, [debouncedApplySearch]);

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

    try {
      await fetchNextPage();
    } catch (error) {
      console.error('Failed to fetch next page:', error);
      showToast({
        message: localize('com_ui_unarchive_error'),
        severity: NotificationSeverity.ERROR,
      });
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, showToast, localize]);

  const confirmDelete = useCallback(() => {
    if (!deleteRow?.conversationId) return;
    deleteMutation.mutate({ conversationId: deleteRow.conversationId });
  }, [deleteMutation, deleteRow]);

  const { sortBy, sortDirection } = queryParams;

  const columns = useMemo(
    () => [
      {
        accessorKey: 'title',
        header: () => (
          <span className="text-xs sm:text-sm">{localize('com_nav_archive_name')}</span>
        ),
        cell: ({ row }) => {
          const { conversationId, title } = row.original;
          return (
            <button
              type="button"
              className="flex items-center gap-2 truncate"
              onClick={() => window.open(`/c/${conversationId}`, '_blank')}
            >
              <MinimalIcon
                endpoint={row.original.endpoint}
                size={28}
                isCreatedByUser={false}
                iconClassName="size-4"
              />
              <span className="underline">{title}</span>
            </button>
          );
        },
        meta: {
          size: isSmallScreen ? '70%' : '50%',
          mobileSize: '70%',
          enableSorting: true,
        },
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
          enableSorting: true,
        },
      },
      {
        accessorKey: 'actions',
        header: () => (
          <Label className="px-2 py-0 text-xs sm:px-2 sm:py-2 sm:text-sm">
            {localize('com_assistants_actions')}
          </Label>
        ),
        cell: ({ row }) => {
          const conversation = row.original;
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
                      setUnarchivingId(conversation.conversationId);
                      unarchiveMutation.mutate(
                        { conversationId: conversation.conversationId, isArchived: false },
                        { onSettled: () => setUnarchivingId(null) },
                      );
                    }}
                    disabled={isRowUnarchiving}
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
          enableSorting: false,
        },
      },
    ],
    [isSmallScreen, localize, unarchivingId, unarchiveMutation],
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
            filterColumn="title"
            onFilterChange={onFilterChange}
            filterValue={searchInput}
            fetchNextPage={handleFetchNextPage}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            isLoading={isLoading}
            showCheckboxes={false}
            enableSearch={!!isSearchEnabled}
            onSortChange={handleSort}
            sortBy={sortBy}
            sortDirection={sortDirection}
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
