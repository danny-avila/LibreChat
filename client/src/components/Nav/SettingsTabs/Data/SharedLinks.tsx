import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrashIcon } from 'lucide-react';
import type { SharedLinkItem, SharedLinkListParams } from 'librechat-data-provider';
import { useDeleteSharedLinkMutation, useSharedLinksQuery } from '~/data-provider';
import { OGDialog, OGDialogTrigger, Checkbox, Button } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useLocalize, useMediaQuery } from '~/hooks';
import DataTable from '~/components/ui/DataTable';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { formatDate } from '~/utils';

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  totalPages: number;
  totalItems: number;
}

export default function SharedLinks() {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { showToast } = useToastContext();

  const [queryParams, setQueryParams] = useState<SharedLinkListParams>({
    pageNumber: 1,
    pageSize: 10,
    isPublic: true,
    sortBy: 'createdAt',
    sortDirection: 'asc',
  });

  const query = useSharedLinksQuery(queryParams, {
    enabled: false,
  });

  const fetchData = useCallback(
    async ({
      page,
      filterValue,
      sortBy,
      sortDirection,
    }: {
      page: number;
      filterValue?: string;
      sortBy?: string;
      sortDirection?: 'asc' | 'desc';
    }): Promise<PaginatedResponse<SharedLinkItem & { id?: string }>> => {
      const newParams: SharedLinkListParams = {
        pageNumber: page + 1,
        pageSize: 10,
        isPublic: true,
        sortBy: (sortBy === 'title' ? 'title' : 'createdAt') as 'createdAt' | 'title',
        sortDirection: sortDirection ?? 'asc',
        search: filterValue,
      };
      setQueryParams(newParams);

      const result = await query.refetch();

      if (!result.data?.pages || result.data.pages.length === 0) {
        return {
          data: [],
          total: 0,
          totalPages: 0,
          totalItems: 0,
        };
      }

      const data = result.data.pages[0];
      return {
        data: data.links.map((link) => ({ id: link.shareId, ...link })),
        total: data.totalCount,
        totalPages: data.pages,
        totalItems: data.totalCount,
      };
    },
    [],
  );

  const mutation = useDeleteSharedLinkMutation({
    onError: () => {
      showToast({
        message: localize('com_ui_share_delete_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const handleDelete = useCallback(
    async (selectedRows: Array<{ id?: string }>) => {
      try {
        for (const row of selectedRows) {
          if (typeof row.id === 'string' && row.id.length > 0) {
            await mutation.mutateAsync({ shareId: row.id });
          }
        }
      } catch (error) {
        console.error('Failed to delete shared link:', error);
      }
    },
    [mutation],
  );

  const columns = [
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
      meta: {
        size: '30px',
      },
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
          size="icon"
          variant="ghost"
          className="p-2 hover:bg-surface-hover"
          onClick={() => {
            console.log('row', row);
          }}
        >
          <TrashIcon className="size-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_shared_links')}</div>

      <OGDialog>
        <OGDialogTrigger asChild onClick={() => query.refetch()}>
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
              fetchData={fetchData}
              onDelete={handleDelete}
              filterColumn="title"
            />
          }
        />
      </OGDialog>
    </div>
  );
}
