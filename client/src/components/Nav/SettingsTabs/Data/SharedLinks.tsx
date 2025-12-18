import { useCallback, useState, useMemo, useEffect } from 'react';
import { Trans } from 'react-i18next';
import debounce from 'lodash/debounce';
import { useRecoilValue } from 'recoil';
import { Link } from 'react-router-dom';
import {
  TrashIcon,
  MessageSquare,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from 'lucide-react';
import type { SharedLinkItem, SharedLinksListParams } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import {
  OGDialog,
  useToastContext,
  OGDialogTemplate,
  OGDialogTrigger,
  OGDialogContent,
  useMediaQuery,
  OGDialogHeader,
  OGDialogTitle,
  TooltipAnchor,
  DataTable,
  Spinner,
  Button,
  Label,
} from '@librechat/client';
import { useDeleteSharedLinkMutation, useSharedLinksQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { formatDate } from '~/utils';
import store from '~/store';

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
  const isSearchEnabled = useRecoilValue(store.search);
  const [queryParams, setQueryParams] = useState<SharedLinksListParams>(DEFAULT_PARAMS);
  const [deleteRow, setDeleteRow] = useState<SharedLinkItem | null>(null);
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
          message: localize('com_ui_no_valid_items' as TranslationKeys),
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
              ? ('com_ui_shared_link_delete_success' as TranslationKeys)
              : ('com_ui_shared_link_bulk_delete_success' as TranslationKeys),
          ),
          severity: NotificationSeverity.SUCCESS,
        });
      } catch (error) {
        console.error('Failed to delete shared links:', error);
        showToast({
          message: localize('com_ui_bulk_delete_error' as TranslationKeys),
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
              aria-label={localize('com_ui_name_sort')}
              aria-current={sortState ? 'true' : 'false'}
            >
              {localize('com_ui_name')}
              <SortIcon className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
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
                className="group flex items-center gap-1 truncate rounded-sm text-blue-600 underline decoration-1 underline-offset-2 hover:decoration-2 focus:outline-none focus:ring-2 focus:ring-ring"
                title={title}
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
          size: '35%',
          mobileSize: '50%',
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
              aria-label={localize('com_ui_creation_date_sort' as TranslationKeys)}
              aria-current={sortState ? 'true' : 'false'}
            >
              {localize('com_ui_date')}
              <SortIcon className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
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
              description={localize('com_ui_open_source_chat_new_tab')}
              render={
                <a
                  href={`/c/${row.original.conversationId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-md p-0 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label={localize('com_ui_open_source_chat_new_tab_title', {
                    title: row.original.title || localize('com_ui_untitled'),
                  })}
                >
                  <MessageSquare className="size-4" aria-hidden="true" />
                </a>
              }
            />
            <TooltipAnchor
              description={localize('com_ui_delete_shared_link_heading')}
              render={
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0 hover:bg-surface-hover"
                  onClick={() => {
                    setDeleteRow(row.original);
                    setIsDeleteOpen(true);
                  }}
                  aria-label={localize('com_ui_delete_shared_link', {
                    title: row.original.title || localize('com_ui_untitled'),
                  })}
                  aria-haspopup="dialog"
                  aria-controls="delete-shared-link-dialog"
                >
                  <TrashIcon className="size-4" aria-hidden="true" />
                </Button>
              }
            />
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

        <OGDialogContent
          title={localize('com_nav_shared_links')}
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
            isLoading={isLoading}
            enableSearch={isSearchEnabled}
          />
        </OGDialogContent>
      </OGDialog>
      <OGDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_delete_shared_link_heading')}
          className="max-w-[450px]"
          main={
            <>
              <div
                id="delete-shared-link-dialog"
                className="flex w-full flex-col items-center gap-2"
              >
                <div className="grid w-full items-center gap-2">
                  <Label htmlFor="dialog-confirm-delete" className="text-left text-sm font-medium">
                    <Trans
                      i18nKey="com_ui_delete_confirm_strong"
                      values={{ title: deleteRow?.title }}
                      components={{ strong: <strong /> }}
                    />
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
