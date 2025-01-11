import { useCallback, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TrashIcon } from 'lucide-react';
import type { SharedLinkItem, SharedLinksListParams } from 'librechat-data-provider';
import { OGDialog, OGDialogTrigger, Checkbox, Button, TooltipAnchor, Label } from '~/components/ui';
import { useDeleteSharedLinkMutation, useSharedLinksQuery } from '~/data-provider';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useLocalize, useMediaQuery } from '~/hooks';
import DataTable from '~/components/ui/DataTable';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { formatDate } from '~/utils';

interface TableRow extends SharedLinkItem {
  id?: string;
}

const PAGE_SIZE = 250;

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
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

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
    if (hasNextPage !== true || isFetchingNextPage) {
      return;
    }
    await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const [deleteRow, setDeleteRow] = useState<TableRow | null>(null);

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
        header: 'Name',
        cell: ({ row }) =>  (
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
        cell: ({ row }) =>  (
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
          />
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
            />
          }
        />
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
            selectClasses:
              'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </div>
  );
}
