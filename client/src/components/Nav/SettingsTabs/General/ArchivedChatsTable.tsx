import { useState, useCallback, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import debounce from 'lodash/debounce';
import { Search, TrashIcon, MessageCircle, ArchiveRestore } from 'lucide-react';
import type { TConversation } from 'librechat-data-provider';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Label,
  Separator,
  Skeleton,
  Spinner,
} from '~/components';
import {
  useConversationsInfiniteQuery,
  useArchiveConvoMutation,
  useDeleteConversationMutation,
} from '~/data-provider';
import { useAuthContext, useLocalize, useMediaQuery } from '~/hooks';
import DataTable from '~/components/ui/DataTable';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { cn, formatDate } from '~/utils';

const DEFAULT_PARAMS = {
  isArchived: true,
  search: '',
  sortBy: 'createdAt',
  sortDirection: 'desc',
  // use nextCursor for pagination
};

export default function ArchivedChatsTable() {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { showToast } = useToastContext();

  const [queryParams, setQueryParams] = useState(DEFAULT_PARAMS);
  const [deleteConversation, setDeleteConversation] = useState<TConversation | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useConversationsInfiniteQuery(queryParams, {
      enabled: isAuthenticated,
      staleTime: 0,
      cacheTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    });

  const unarchiveMutation = useArchiveConvoMutation();
  const deleteMutation = useDeleteConversationMutation({
    onSuccess: async () => {
      showToast({
        message: localize('com_ui_delete_success'),
        severity: NotificationSeverity.SUCCESS,
      });
      setIsDeleteOpen(false);
      setDeleteConversation(null);
      await refetch();
    },
    onError: (error) => {
      console.error('Delete error:', error);
      showToast({
        message: localize('com_ui_delete_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const handleUnarchive = useCallback(
    (conversationId: string) => {
      unarchiveMutation.mutate({ conversationId, isArchived: false });
    },
    [unarchiveMutation],
  );

  const allConversations: TConversation[] = useMemo(() => {
    if (!data?.pages) {
      return [];
    }
    return data.pages.flatMap((page) => page.conversations ?? []);
  }, [data]);

  const handleSort = useCallback((sortField: string, sortOrder: 'asc' | 'desc') => {
    setQueryParams((prev) => ({
      ...prev,
      sortBy: sortField,
      sortDirection: sortOrder,
    }));
  }, []);

  const handleFilterChange = useCallback((value: string) => {
    setQueryParams((prev) => ({
      ...prev,
      search: encodeURIComponent(value.trim()),
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
          return (
            <Button
              variant="ghost"
              className="px-2 py-0 text-xs sm:px-2 sm:py-2 sm:text-sm"
              onClick={() => handleSort('title', column.getIsSorted() === 'asc' ? 'desc' : 'asc')}
            >
              {localize('com_nav_archive_name')}
            </Button>
          );
        },
        cell: ({ row }) => {
          const { conversationId, title } = row.original;
          return (
            <button
              type="button"
              className="flex items-center gap-1 truncate"
              onClick={() => window.open(`/c/${conversationId}`, '_blank')}
            >
              <MessageCircle className="size-4" />
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
          return (
            <Button
              variant="ghost"
              className="px-2 py-0 text-xs sm:px-2 sm:py-2 sm:text-sm"
              onClick={() =>
                handleSort('createdAt', column.getIsSorted() === 'asc' ? 'desc' : 'asc')
              }
            >
              {localize('com_nav_archive_created_at')}
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
              <Button
                variant="ghost"
                size="icon"
                aria-label={localize('com_ui_unarchive')}
                onClick={() => handleUnarchive(conversation.conversationId)}
              >
                <ArchiveRestore className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={localize('com_ui_delete')}
                onClick={() => {
                  setDeleteConversation(conversation);
                  setIsDeleteOpen(true);
                }}
              >
                <TrashIcon className="size-4" />
              </Button>
            </div>
          );
        },
        meta: {
          size: '15%',
          mobileSize: '25%',
        },
      },
    ],
    [handleSort, handleUnarchive, isSmallScreen, localize],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="flex items-center">
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
    );
  }

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
        showCheckboxes={false}
      />

      <OGDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <OGDialogContent
          title={localize('com_ui_delete_archived_chat')}
          className="max-w-[450px] bg-background text-text-primary shadow-2xl"
        >
          <OGDialogHeader>
            <OGDialogTitle>
              {localize('com_ui_delete_confirm')} <strong>{deleteConversation?.title}</strong>
            </OGDialogTitle>
          </OGDialogHeader>
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              {localize('com_ui_cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteMutation.mutate({ conversationId: deleteConversation?.conversationId ?? '' })
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
