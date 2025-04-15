import { useState, useCallback, useMemo, useEffect } from 'react';
import debounce from 'lodash/debounce';
import { TrashIcon, ArchiveRestore, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { ConversationListParams, TConversation } from 'librechat-data-provider';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Label,
  TooltipAnchor,
  Spinner,
} from '~/components';
import {
  useArchiveConvoMutation,
  useConversationsInfiniteQuery,
  useDeleteConversationMutation,
} from '~/data-provider';
import { useLocalize, useMediaQuery } from '~/hooks';
import { MinimalIcon } from '~/components/Endpoints';
import DataTable from '~/components/ui/DataTable';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { formatDate } from '~/utils';

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
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { showToast } = useToastContext();

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [queryParams, setQueryParams] = useState<ConversationListParams>(DEFAULT_PARAMS);
  const [deleteConversation, setDeleteConversation] = useState<TConversation | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isLoading } =
    useConversationsInfiniteQuery(queryParams, {
      staleTime: 0,
      cacheTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    });

  const handleSort = useCallback((sortField: string, sortOrder: 'asc' | 'desc') => {
    setQueryParams((prev) => ({
      ...prev,
      sortBy: sortField as 'title' | 'createdAt',
      sortDirection: sortOrder,
    }));
  }, []);

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
    },
    onError: (error: unknown) => {
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
        header: () => {
          const isSorted = queryParams.sortBy === 'title';
          const sortDirection = queryParams.sortDirection;
          return (
            <Button
              variant="ghost"
              className="px-2 py-0 text-xs hover:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm"
              onClick={() =>
                handleSort('title', isSorted && sortDirection === 'asc' ? 'desc' : 'asc')
              }
            >
              {localize('com_nav_archive_name')}
              {isSorted && sortDirection === 'asc' && (
                <ArrowUp className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
              )}
              {isSorted && sortDirection === 'desc' && (
                <ArrowDown className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
              )}
              {!isSorted && <ArrowUpDown className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />}
            </Button>
          );
        },
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
        },
      },
      {
        accessorKey: 'createdAt',
        header: () => {
          const isSorted = queryParams.sortBy === 'createdAt';
          const sortDirection = queryParams.sortDirection;
          return (
            <Button
              variant="ghost"
              className="px-2 py-0 text-xs hover:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm"
              onClick={() =>
                handleSort('createdAt', isSorted && sortDirection === 'asc' ? 'desc' : 'asc')
              }
            >
              {localize('com_nav_archive_created_at')}
              {isSorted && sortDirection === 'asc' && (
                <ArrowUp className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
              )}
              {isSorted && sortDirection === 'desc' && (
                <ArrowDown className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
              )}
              {!isSorted && <ArrowUpDown className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />}
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
                description={localize('com_ui_delete')}
                render={
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 hover:bg-surface-hover"
                    onClick={() => {
                      setDeleteConversation(row.original);
                      setIsDeleteOpen(true);
                    }}
                    title={localize('com_ui_delete')}
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
    [handleSort, isSmallScreen, localize, queryParams, unarchiveMutation],
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
        manualSorting={true} // Ensures server-side sorting
      />

      <OGDialog open={isDeleteOpen} onOpenChange={onOpenChange}>
        <OGDialogContent
          title={localize('com_ui_delete_confirm') + ' ' + (deleteConversation?.title ?? '')}
          className="w-11/12 max-w-md"
        >
          <OGDialogHeader>
            <OGDialogTitle>
              {localize('com_ui_delete_confirm')} <strong>{deleteConversation?.title}</strong>
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
