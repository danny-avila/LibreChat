import { useState, useCallback, useMemo, useEffect } from 'react';
import debounce from 'lodash/debounce';
import { useRecoilValue } from 'recoil';
import { ArchiveRestore, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import {
  Button,
  Label,
  Spinner,
  DataTable,
  TooltipAnchor,
  useMediaQuery,
  useToastContext,
} from '@librechat/client';
import type { ConversationListParams } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { useConversationsInfiniteQuery, useArchiveConvoMutation } from '~/data-provider';
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

export default function ArchivedChatsTable() {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { showToast } = useToastContext();
  const searchState = useRecoilValue(store.search);
  const [queryParams, setQueryParams] = useState<ConversationListParams>(DEFAULT_PARAMS);

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
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="px-2 py-0 text-xs hover:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm"
              aria-sort={ariaSort}
              aria-label={localize('com_nav_archive_name_sort' as TranslationKeys)}
              aria-current={sortState ? 'true' : 'false'}
            >
              {localize('com_nav_archive_name')}
              <SortIcon className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const { conversationId, title } = row.original;
          return (
            <button
              type="button"
              className="flex items-center gap-2 truncate rounded-sm"
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
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="px-2 py-0 text-xs hover:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm"
              aria-sort={ariaSort}
              aria-label={localize('com_nav_archive_created_at_sort' as TranslationKeys)}
              aria-current={sortState ? 'true' : 'false'}
            >
              {localize('com_nav_archive_created_at')}
              <SortIcon className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
            </Button>
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
                description={localize('com_ui_unarchive')}
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
                    title={localize('com_ui_unarchive')}
                    aria-label={localize('com_ui_unarchive')}
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
    </>
  );
}
