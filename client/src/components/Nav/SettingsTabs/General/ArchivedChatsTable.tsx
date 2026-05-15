import { useState, useCallback, useMemo, useEffect } from 'react';
import { Trans } from 'react-i18next';
import debounce from 'lodash/debounce';
import { useRecoilValue } from 'recoil';
import { Link } from 'react-router-dom';
import {
  ArrowUp,
  TrashIcon,
  ArrowDown,
  ArrowUpDown,
  ExternalLink,
  ArchiveRestore,
} from 'lucide-react';
import {
  Label,
  Button,
  Spinner,
  OGDialog,
  DataTable,
  TooltipAnchor,
  useMediaQuery,
  OGDialogTitle,
  OGDialogHeader,
  useToastContext,
  OGDialogContent,
} from '@librechat/client';
import type { ConversationListParams, TConversation } from 'librechat-data-provider';
import {
  useConversationsInfiniteQuery,
  useDeleteConversationMutation,
  useArchiveConvoMutation,
} from '~/data-provider';
import { MinimalIcon } from '~/components/Endpoints';
import { NotificationSeverity } from '~/common';
import { formatDate, logger } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

const DEFAULT_PARAMS: ConversationListParams = {
  isArchived: true,
  sortBy: 'createdAt',
  sortDirection: 'desc',
  search: '',
};

export default function ArchivedChatsTable({
  onOpenChange,
}: {
  onOpenChange: (isOpen: boolean) => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const searchState = useRecoilValue(store.search);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const [queryParams, setQueryParams] = useState<ConversationListParams>(DEFAULT_PARAMS);
  const [deleteConversation, setDeleteConversation] = useState<TConversation | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isLoading } =
    useConversationsInfiniteQuery(queryParams, {
      staleTime: 0,
      cacheTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    });

  const handleFilterChange = useCallback((value: string) => {
    const encodedValue = encodeURIComponent(value.trim());
    setQueryParams((prev) => ({
      ...prev,
      search: encodedValue,
    }));
  }, []);

  const debouncedFilterChange = useMemo(
    () => debounce(handleFilterChange, 300),
    [handleFilterChange],
  );

  useEffect(() => {
    return () => {
      debouncedFilterChange.cancel();
    };
  }, [debouncedFilterChange]);

  const allConversations = useMemo(() => {
    if (!data?.pages) {
      return [];
    }
    return data.pages.flatMap((page) => page?.conversations?.filter(Boolean) ?? []);
  }, [data?.pages]);

  const deleteMutation = useDeleteConversationMutation({
    onSuccess: async () => {
      setIsDeleteOpen(false);
      await refetch();
      showToast({
        message: localize('com_ui_convo_delete_success'),
        severity: NotificationSeverity.SUCCESS,
        showIcon: true,
      });
    },
    onError: (error: unknown) => {
      logger.error('Error deleting archived conversation:', error);
      showToast({
        message: localize('com_ui_archive_delete_error') as string,
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const unarchiveMutation = useArchiveConvoMutation({
    onSuccess: async () => {
      await refetch();
    },
    onError: (error: unknown) => {
      logger.error('Error unarchiving conversation', error);
      showToast({
        message: localize('com_ui_unarchive_error') as string,
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const handleFetchNextPage = useCallback(async () => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }
    await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => {
          const sortState = column.getIsSorted();
          let SortIcon = ArrowUpDown;
          let ariaSort: 'ascending' | 'descending' | 'none' = 'none';
          if (sortState === 'desc') {
            SortIcon = ArrowDown;
            ariaSort = 'descending';
          } else if (sortState === 'asc') {
            SortIcon = ArrowUp;
            ariaSort = 'ascending';
          }
          return (
            <TooltipAnchor
              description={localize('com_ui_name_sort')}
              side="top"
              render={
                <Button
                  variant="ghost"
                  onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                  className="px-2 py-0 text-xs hover:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm"
                  aria-sort={ariaSort}
                  aria-label={localize('com_ui_name_sort')}
                  aria-current={sortState ? 'true' : 'false'}
                >
                  {localize('com_nav_archive_name')}
                  <SortIcon className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
                </Button>
              }
            />
          );
        },
        cell: ({ row }) => {
          const { conversationId, title } = row.original;
          return (
            <div className="flex items-center gap-2">
              <MinimalIcon
                endpoint={row.original.endpoint}
                size={28}
                isCreatedByUser={false}
                iconClassName="size-4"
              />
              <Link
                to={`/c/${conversationId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-1 truncate rounded-sm text-blue-600 underline decoration-1 underline-offset-2 hover:decoration-2 focus:outline-none focus:ring-2 focus:ring-ring"
                title={title}
                aria-label={localize('com_ui_open_archived_chat_new_tab_title', { title })}
              >
                <span className="truncate">{title}</span>
                <ExternalLink
                  className="size-3 flex-shrink-0 opacity-70 group-hover:opacity-100"
                  aria-hidden="true"
                />
              </Link>
            </div>
          );
        },
        meta: {
          size: isSmallScreen ? '70%' : '50%',
          mobileSize: '70%',
        },
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => {
          const sortState = column.getIsSorted();
          let SortIcon = ArrowUpDown;
          let ariaSort: 'ascending' | 'descending' | 'none' = 'none';
          if (sortState === 'desc') {
            SortIcon = ArrowDown;
            ariaSort = 'descending';
          } else if (sortState === 'asc') {
            SortIcon = ArrowUp;
            ariaSort = 'ascending';
          }
          return (
            <TooltipAnchor
              description={localize('com_ui_date_sort')}
              side="top"
              render={
                <Button
                  variant="ghost"
                  onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                  className="px-2 py-0 text-xs hover:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm"
                  aria-sort={ariaSort}
                  aria-label={localize('com_ui_date_sort')}
                  aria-current={sortState ? 'true' : 'false'}
                >
                  {localize('com_nav_archive_created_at')}
                  <SortIcon className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
                </Button>
              }
            />
          );
        },
        cell: ({ row }) => formatDate(row.original.createdAt?.toString() ?? '', isSmallScreen),
        meta: {
          size: isSmallScreen ? '30%' : '35%',
          mobileSize: '30%',
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
          return (
            <div className="flex items-center gap-2">
              <TooltipAnchor
                description={localize('com_ui_unarchive_conversation')}
                render={
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 hover:bg-surface-hover"
                    onClick={() =>
                      unarchiveMutation.mutate({
                        conversationId: conversation.conversationId,
                        isArchived: false,
                      })
                    }
                    title={localize('com_ui_unarchive_conversation')}
                    aria-label={localize('com_ui_unarchive_conversation')}
                    disabled={unarchiveMutation.isLoading}
                  >
                    {unarchiveMutation.isLoading ? (
                      <Spinner />
                    ) : (
                      <ArchiveRestore className="size-4" />
                    )}
                  </Button>
                }
              />
              <TooltipAnchor
                description={localize('com_ui_delete_conversation_tooltip')}
                render={
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 hover:bg-surface-hover"
                    onClick={() => {
                      setDeleteConversation(row.original);
                      setIsDeleteOpen(true);
                    }}
                    title={localize('com_ui_delete_conversation_tooltip')}
                    aria-label={localize('com_ui_delete_conversation_tooltip')}
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
      },
    ],
    [isSmallScreen, localize, unarchiveMutation],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={allConversations}
        filterColumn="title"
        onFilterChange={debouncedFilterChange}
        filterValue={queryParams.search}
        fetchNextPage={handleFetchNextPage}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isLoading={isLoading}
        showCheckboxes={false}
        enableSearch={searchState.enabled === true}
      />

      <OGDialog open={isDeleteOpen} onOpenChange={onOpenChange}>
        <OGDialogContent
          title={localize('com_ui_delete_confirm', {
            title: deleteConversation?.title ?? localize('com_ui_untitled'),
          })}
          className="w-11/12 max-w-md"
        >
          <OGDialogHeader>
            <OGDialogTitle>
              <Trans
                i18nKey="com_ui_delete_confirm_strong"
                values={{ title: deleteConversation?.title }}
                components={{ strong: <strong /> }}
              />
            </OGDialogTitle>
          </OGDialogHeader>
          <div className="flex justify-end gap-4 pt-4">
            <Button aria-label="cancel" variant="outline" onClick={() => setIsDeleteOpen(false)}>
              {localize('com_ui_cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteMutation.mutate({
                  conversationId: deleteConversation?.conversationId ?? '',
                })
              }
              disabled={deleteMutation.isLoading}
            >
              {deleteMutation.isLoading ? <Spinner /> : localize('com_ui_delete')}
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
