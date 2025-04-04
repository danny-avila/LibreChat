import { useCallback, useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import debounce from 'lodash/debounce';
import { TrashIcon, MessageSquare, ArrowUpDown } from 'lucide-react';
import type { SharedLinkItem, SharedLinksListParams } from 'librechat-data-provider';
import {
  OGDialog,
  OGDialogTrigger,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Button,
  TooltipAnchor,
  Label,
} from '~/components/ui';
import { useDeleteSharedLinkMutation, useSharedLinksQuery } from '~/data-provider';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useLocalize, useMediaQuery } from '~/hooks';
import DataTable from '~/components/ui/DataTable';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { formatDate } from '~/utils';
import { Spinner } from '~/components/svg';

const PAGE_SIZE = 25;

const DEFAULT_PARAMS: SharedLinksListParams = {
  pageSize: PAGE_SIZE,
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
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isLoading } =
    useSharedLinksQuery(queryParams, {
      enabled: isOpen,
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
        showToast({
          message: localize('com_ui_no_valid_items'),
          severity: NotificationSeverity.WARNING,
        });
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
          message: localize('com_ui_bulk_delete_error'),
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
    await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const [deleteRow, setDeleteRow] = useState<SharedLinkItem | null>(null);

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
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              className="px-2 py-0 text-xs hover:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm"
              onClick={() => handleSort('title', column.getIsSorted() === 'asc' ? 'desc' : 'asc')}
            >
              {localize('com_ui_name')}
              <ArrowUpDown className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
            </Button>
          );
        },
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
        },
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              className="px-2 py-0 text-xs hover:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm"
              onClick={() =>
                handleSort('createdAt', column.getIsSorted() === 'asc' ? 'desc' : 'asc')
              }
            >
              {localize('com_ui_date')}
              <ArrowUpDown className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
            </Button>
          );
        },
        cell: ({ row }) => formatDate(row.original.createdAt?.toString() ?? '', isSmallScreen),
        meta: {
          size: '10%',
          mobileSize: '20%',
        },
      },
      {
        accessorKey: 'actions',
        header: () => (
          <Label className="px-2 py-0 text-xs hover:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm">
            {localize('com_assistants_actions')}
          </Label>
        ),
        meta: {
          size: '7%',
          mobileSize: '25%',
        },
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <TooltipAnchor
              description={localize('com_ui_view_source')}
              render={
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0 hover:bg-surface-hover"
                  onClick={() => {
                    window.open(`/c/${row.original.conversationId}`, '_blank');
                  }}
                  title={localize('com_ui_view_source')}
                >
                  <MessageSquare className="size-4" />
                </Button>
              }
            ></TooltipAnchor>
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
                  title={localize('com_ui_delete')}
                >
                  <TrashIcon className="size-4" />
                </Button>
              }
            ></TooltipAnchor>
          </div>
        ),
      },
    ],
    [isSmallScreen, localize],
  );

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_shared_links')}</div>

      <OGDialog open={isOpen} onOpenChange={setIsOpen}>
        <OGDialogTrigger asChild onClick={() => setIsOpen(true)}>
          <Button variant="outline">{localize('com_ui_manage')}</Button>
        </OGDialogTrigger>

        <OGDialogContent
          title={localize('com_nav_my_files')}
          className="w-11/12 max-w-5xl bg-background text-text-primary shadow-2xl"
        >
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_nav_shared_links')}</OGDialogTitle>
          </OGDialogHeader>
          <DataTable
            columns={columns}
            data={allLinks}
            onDelete={handleDelete}
            filterColumn="title"
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={handleFetchNextPage}
            showCheckboxes={false}
            onFilterChange={debouncedFilterChange}
            filterValue={queryParams.search}
          />
        </OGDialogContent>
      </OGDialog>
      <OGDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_delete_shared_link')}
          className="max-w-[450px]"
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
