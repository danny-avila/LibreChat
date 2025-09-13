import { useCallback, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TrashIcon, MessageSquare } from 'lucide-react';
import type { SharedLinkItem, SharedLinksListParams } from 'librechat-data-provider';
import {
  OGDialog,
  useToastContext,
  OGDialogTemplate,
  OGDialogTrigger,
  OGDialogContent,
  useMediaQuery,
  OGDialogHeader,
  OGDialogTitle,
  DataTable,
  Spinner,
  Button,
  Label,
} from '@librechat/client';
import { useDeleteSharedLinkMutation, useSharedLinksQuery } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';
import { formatDate } from '~/utils';

const DEFAULT_PARAMS: SharedLinksListParams = {
  pageSize: 25,
  isPublic: true,
  sortBy: 'createdAt',
  sortDirection: 'desc',
  search: '',
};

export default function SharedLinks() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const [queryParams, setQueryParams] = useState<SharedLinksListParams>(DEFAULT_PARAMS);
  const [deleteRow, setDeleteRow] = useState<SharedLinkItem | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching, refetch, isLoading } =
    useSharedLinksQuery(queryParams, {
      enabled: isOpen,
      keepPreviousData: true,
      staleTime: 30 * 1000,
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

  const allLinks = useMemo(() => {
    if (!data?.pages) {
      return [];
    }

    return data.pages.flatMap((page) => page.links.filter(Boolean));
  }, [data?.pages]);

  const deleteMutation = useDeleteSharedLinkMutation({
    onSuccess: async () => {
      setIsDeleteOpen(false);
      setDeleteRow(null);
      await refetch();
    },
    onError: (error) => {
      console.error('Delete error:', error);
      showToast({
        message: localize('com_ui_share_delete_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const handleDelete = useCallback(
    async (selectedRows: SharedLinkItem[]) => {
      const validRows = selectedRows.filter(
        (row) => typeof row.shareId === 'string' && row.shareId.length > 0,
      );

      if (validRows.length === 0) {
        return;
      }

      try {
        for (const row of validRows) {
          await deleteMutation.mutateAsync({ shareId: row.shareId });
        }

        showToast({
          message: localize(
            validRows.length === 1
              ? 'com_ui_shared_link_delete_success'
              : 'com_ui_shared_link_bulk_delete_success',
          ),
          severity: NotificationSeverity.SUCCESS,
        });
      } catch (error) {
        console.error('Failed to delete shared links:', error);
        showToast({
          message: localize('com_ui_share_delete_error'),
          severity: NotificationSeverity.ERROR,
        });
      }
    },
    [deleteMutation, showToast, localize],
  );

  const handleFetchNextPage = useCallback(async () => {
    if (hasNextPage !== true || isFetchingNextPage) {
      return;
    }

    try {
      await fetchNextPage();
    } catch (error) {
      console.error('Failed to fetch next page:', error);
      showToast({
        message: localize('com_ui_share_delete_error'),
        severity: NotificationSeverity.ERROR,
      });
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, showToast, localize]);

  const confirmDelete = useCallback(() => {
    if (deleteRow) {
      handleDelete([deleteRow]);
    }
    setIsDeleteOpen(false);
  }, [deleteRow, handleDelete]);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'title',
        header: () => <span className="text-xs sm:text-sm">{localize('com_ui_name')}</span>,
        cell: ({ row }) => {
          const { title, shareId } = row.original;
          return (
            <div className="flex items-center gap-2">
              <Link
                to={`/share/${shareId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-blue-500 hover:underline"
                title={title}
              >
                {title}
              </Link>
            </div>
          );
        },
        meta: {
          size: '35%',
          mobileSize: '50%',
          enableSorting: true,
        },
      },
      {
        accessorKey: 'createdAt',
        header: () => <span className="text-xs sm:text-sm">{localize('com_ui_date')}</span>,
        cell: ({ row }) => formatDate(row.original.createdAt?.toString() ?? '', isSmallScreen),
        meta: {
          size: '10%',
          mobileSize: '20%',
          enableSorting: true,
        },
      },
      {
        accessorKey: 'actions',
        header: () => <Label>{localize('com_assistants_actions')}</Label>,
        meta: {
          size: '7%',
          mobileSize: '25%',
          enableSorting: false,
        },
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-surface-hover"
              onClick={() => {
                window.open(`/c/${row.original.conversationId}`, '_blank');
              }}
              aria-label={`${localize('com_ui_view_source')} - ${row.original.title || localize('com_ui_untitled')}`}
            >
              <MessageSquare className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-surface-hover"
              onClick={() => {
                setDeleteRow(row.original);
                setIsDeleteOpen(true);
              }}
              aria-label={`${localize('com_ui_delete')} - ${row.original.title || localize('com_ui_untitled')}`}
            >
              <TrashIcon className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [isSmallScreen, localize],
  );

  return (
    <div className="flex items-center justify-between">
      <Label id="shared-links-label">{localize('com_nav_shared_links')}</Label>
      <OGDialog open={isOpen} onOpenChange={setIsOpen}>
        <OGDialogTrigger asChild onClick={() => setIsOpen(true)}>
          <Button aria-labelledby="shared-links-label" variant="outline">
            {localize('com_ui_manage')}
          </Button>
        </OGDialogTrigger>
        <OGDialogContent className="w-11/12 max-w-5xl">
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_nav_shared_links')}</OGDialogTitle>
          </OGDialogHeader>
          <DataTable
            columns={columns}
            data={allLinks}
            onDelete={handleDelete}
            config={{
              skeleton: { count: 10 },
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
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            isFetching={isFetching}
            fetchNextPage={handleFetchNextPage}
            onFilterChange={handleFilterChange}
            isLoading={isLoading}
            onSortingChange={handleSort}
            sortBy={queryParams.sortBy}
            sortDirection={queryParams.sortDirection}
          />
        </OGDialogContent>
      </OGDialog>
      <OGDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_delete_shared_link')}
          className="w-11/12 max-w-md"
          main={
            <>
              <div className="flex w-full flex-col items-center gap-2">
                <div className="grid w-full items-center gap-2">
                  <Label htmlFor="dialog-confirm-delete" className="text-left text-sm font-medium">
                    {localize('com_ui_delete_confirm')} <strong>{deleteRow?.title}</strong>
                  </Label>
                </div>
              </div>
            </>
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
