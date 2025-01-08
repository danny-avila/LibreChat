import { useCallback, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TrashIcon } from 'lucide-react';
import type { SharedLinkItem, SharedLinksListParams } from 'librechat-data-provider';
import { useDeleteSharedLinkMutation, useSharedLinksQuery } from '~/data-provider';
import { OGDialog, OGDialogTrigger, Checkbox, Button } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useLocalize, useMediaQuery } from '~/hooks';
import DataTable from '~/components/ui/DataTable';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { formatDate } from '~/utils';

interface TableRow extends SharedLinkItem {
  id?: string;
}

const PAGE_SIZE = 25;

const DEFAULT_PARAMS: SharedLinksListParams = {
  pageSize: PAGE_SIZE,
  isPublic: true,
  sortBy: 'createdAt',
  sortDirection: 'desc',
  search: '',
};

export default function SharedLinks() {
  const [isOpen, setIsOpen] = useState(false);
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { showToast } = useToastContext();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isLoading } =
    useSharedLinksQuery(DEFAULT_PARAMS, {
      enabled: isOpen,
    });

  const allLinks = useMemo(() => {
    if (!data?.pages) {
      return [];
    }
    return data.pages.flatMap((page) => page.links);
  }, [data?.pages]);

  const deleteMutation = useDeleteSharedLinkMutation({
    onSuccess: () => {
      refetch();
    },
    onError: () => {
      showToast({
        message: localize('com_ui_share_delete_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const handleDelete = useCallback(
    async (selectedRows: TableRow[]) => {
      const validRows = selectedRows.filter(
        (row) => typeof row.id === 'string' && row.id.length > 0,
      );

      try {
        await Promise.all(
          validRows.map((row) => deleteMutation.mutateAsync({ shareId: row.id as string })),
        );
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
    if (!hasNextPage || isFetchingNextPage) {
      console.warn('No more pages to fetch');
      return;
    }

    await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const columns = useMemo(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <div className="flex h-full w-[30px] items-center justify-center">
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex h-full w-[30px] items-center justify-center">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
            />
          </div>
        ),
        meta: { size: '50px' },
      },
      {
        accessorKey: 'title',
        header: 'Name',
        cell: ({ row }) => (
          <Link
            to={`/share/${row.original.shareId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            {row.original.title}
          </Link>
        ),
        meta: {
          size: '65%',
          mobileSize: '70%',
        },
      },
      {
        accessorKey: 'createdAt',
        header: 'Date',
        cell: ({ row }) => formatDate(row.original.createdAt?.toString() ?? '', isSmallScreen),
        meta: {
          size: '20%',
          mobileSize: '15%',
        },
      },
      {
        accessorKey: 'actions',
        header: 'Actions',
        meta: {
          size: '15%',
          mobileSize: '15%',
        },
        cell: ({ row }) => (
          <Button
            variant="ghost"
            className="h-8 w-8 p-0 hover:bg-surface-hover"
            onClick={() => handleDelete([row.original])}
            title={localize('com_ui_delete')}
          >
            <TrashIcon className="size-4" />
          </Button>
        ),
      },
    ],
    [isSmallScreen, handleDelete, localize],
  );

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_shared_links')}</div>

      <OGDialog open={isOpen} onOpenChange={setIsOpen}>
        <OGDialogTrigger asChild onClick={() => setIsOpen(true)}>
          <button className="btn btn-neutral relative">
            {localize('com_nav_shared_links_manage')}
          </button>
        </OGDialogTrigger>
        <OGDialogTemplate
          title={localize('com_nav_shared_links')}
          className="max-w-[1000px]"
          showCancelButton={false}
          main={
            <DataTable
              columns={columns}
              data={allLinks}
              onDelete={handleDelete}
              filterColumn="title"
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              fetchNextPage={handleFetchNextPage}
              isLoading={isLoading}
            />
          }
        />
      </OGDialog>
    </div>
  );
}
