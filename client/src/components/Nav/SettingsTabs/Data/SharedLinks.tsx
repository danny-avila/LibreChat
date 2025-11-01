import { useCallback, useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TrashIcon, MessageSquare } from 'lucide-react';
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
import type { SharedLinkItem, SharedLinksListParams } from 'librechat-data-provider';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { useDeleteSharedLinkMutation, useSharedLinksQuery } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { formatDate, cn } from '~/utils';
import { useLocalize } from '~/hooks';

const DEFAULT_PARAMS: SharedLinksListParams = {
  pageSize: 25,
  isPublic: true,
  sortBy: 'createdAt',
  sortDirection: 'desc',
  search: '',
};

type SortKey = 'createdAt' | 'title';
const isSortKey = (v: string): v is SortKey => v === 'createdAt' || v === 'title';

const defaultSort: SortingState = [
  {
    id: 'createdAt',
    desc: true,
  },
];

type TableColumn<TData, TValue> = ColumnDef<TData, TValue> & {
  meta?: {
    className?: string;
    desktopOnly?: boolean;
  };
};

export default function SharedLinks() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState<SharedLinkItem | null>(null);

  const [queryParams, setQueryParams] = useState<SharedLinksListParams>(DEFAULT_PARAMS);
  const [sorting, setSorting] = useState<SortingState>(defaultSort);
  const [searchValue, setSearchValue] = useState('');

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isLoading } =
    useSharedLinksQuery(queryParams, {
      enabled: isOpen,
      keepPreviousData: true,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    });

  const [allKnownLinks, setAllKnownLinks] = useState<SharedLinkItem[]>([]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
    setAllKnownLinks([]);
    setQueryParams((prev) => ({
      ...prev,
      search: value,
    }));
  }, []);

  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      setSorting((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;

        const coerced = next;
        const primary = coerced[0];

        if (data?.pages) {
          const currentFlattened = data.pages.flatMap((page) => page?.links?.filter(Boolean) ?? []);
          setAllKnownLinks(currentFlattened);
        }

        setQueryParams((p) => {
          let sortBy: SortKey;
          let sortDirection: 'asc' | 'desc';

          if (primary && isSortKey(primary.id)) {
            sortBy = primary.id;
            sortDirection = primary.desc ? 'desc' : 'asc';
          } else {
            sortBy = 'createdAt';
            sortDirection = 'desc';
          }

          const newParams = {
            ...p,
            sortBy,
            sortDirection,
          };

          return newParams;
        });

        return coerced;
      });
    },
    [setQueryParams, data?.pages],
  );

  useEffect(() => {
    if (!data?.pages) return;

    const newFlattened = data.pages.flatMap((page) => page?.links?.filter(Boolean) ?? []);

    const toAdd = newFlattened.filter(
      (link: SharedLinkItem) => !allKnownLinks.some((known) => known.shareId === link.shareId),
    );

    if (toAdd.length > 0) {
      setAllKnownLinks((prev) => [...prev, ...toAdd]);
    }
  }, [data?.pages]);

  const displayData = useMemo(() => {
    const primary = sorting[0];
    if (!primary || allKnownLinks.length === 0) return allKnownLinks;

    return [...allKnownLinks].sort((a: SharedLinkItem, b: SharedLinkItem) => {
      let compare: number;
      if (primary.id === 'createdAt') {
        const aDate = new Date(a.createdAt || 0);
        const bDate = new Date(b.createdAt || 0);
        compare = aDate.getTime() - bDate.getTime();
      } else if (primary.id === 'title') {
        compare = (a.title || '').localeCompare(b.title || '');
      } else {
        return 0;
      }
      return primary.desc ? -compare : compare;
    });
  }, [allKnownLinks, sorting]);

  const deleteMutation = useDeleteSharedLinkMutation({
    onSuccess: (data, variables) => {
      const { shareId } = variables;
      setAllKnownLinks((prev) => prev.filter((link) => link.shareId !== shareId));
      showToast({
        message: localize('com_ui_shared_link_delete_success'),
        severity: NotificationSeverity.SUCCESS,
      });
      setIsDeleteOpen(false);
      refetch();
    },
    onError: () => {
      showToast({
        message: localize('com_ui_share_delete_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const handleFetchNextPage = useCallback(async () => {
    if (!hasNextPage || isFetchingNextPage) return;
    await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const effectiveIsLoading = isLoading && displayData.length === 0;
  const effectiveIsFetching = isFetchingNextPage;

  const confirmDelete = useCallback(() => {
    if (!deleteRow?.shareId) {
      showToast({
        message: localize('com_ui_share_delete_error'),
        severity: NotificationSeverity.WARNING,
      });
      return;
    }
    deleteMutation.mutate({ shareId: deleteRow.shareId });
  }, [deleteMutation, deleteRow, localize, showToast]);

  const columns: TableColumn<Record<string, unknown>, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'title',
        accessorFn: (row: Record<string, unknown>): unknown => {
          const link = row as SharedLinkItem;
          return link.title;
        },
        header: () => (
          <span className="text-xs text-text-primary sm:text-sm">{localize('com_ui_name')}</span>
        ),
        cell: ({ row }) => {
          const link = row.original as SharedLinkItem;
          const { title, shareId } = link;
          return (
            <div className="flex items-center gap-2">
              <Link
                to={`/share/${shareId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center truncate text-blue-500 hover:underline"
                aria-label={localize('com_ui_open_link', { 0: title })}
              >
                {title}
              </Link>
            </div>
          );
        },
        meta: {
          className: 'min-w-[150px] flex-1',
        },
        enableSorting: true,
      },
      {
        accessorKey: 'createdAt',
        accessorFn: (row: Record<string, unknown>): unknown => {
          const link = row as SharedLinkItem;
          return link.createdAt;
        },
        header: () => (
          <span className="text-xs text-text-primary sm:text-sm">{localize('com_ui_date')}</span>
        ),
        cell: ({ row }) => {
          const link = row.original as SharedLinkItem;
          return formatDate(link.createdAt?.toString() ?? '', isSmallScreen);
        },
        meta: {
          className: 'w-32 sm:w-40',
          desktopOnly: true,
        },
        enableSorting: true,
      },
      {
        id: 'actions',
        accessorFn: (row: Record<string, unknown>): unknown => null,
        header: () => (
          <span className="text-xs text-text-primary sm:text-sm">
            {localize('com_assistants_actions')}
          </span>
        ),
        cell: ({ row }) => {
          const link = row.original as SharedLinkItem;
          const { title, conversationId } = link;

          return (
            <div className="flex items-center gap-2">
              <TooltipAnchor
                description={localize('com_ui_view_source')}
                render={
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 hover:bg-surface-hover"
                    onClick={() => {
                      window.open(`/c/${conversationId}`, '_blank');
                    }}
                    aria-label={localize('com_ui_view_source_conversation', { 0: title })}
                  >
                    <MessageSquare className="size-4" />
                  </Button>
                }
              />
              <TooltipAnchor
                description={localize('com_ui_delete')}
                render={
                  <Button
                    variant="destructive"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                      setDeleteRow(link);
                      setIsDeleteOpen(true);
                    }}
                    aria-label={localize('com_ui_delete_link_title', { 0: title })}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                }
              />
            </div>
          );
        },
        meta: {
          className: 'w-24',
        },
        enableSorting: false,
      },
    ],
    [isSmallScreen, localize],
  );

  return (
    <div className="flex items-center justify-between">
      <Label id="shared-links-label">{localize('com_nav_shared_links')}</Label>
      <OGDialog open={isOpen} onOpenChange={setIsOpen}>
        <OGDialogTrigger asChild>
          <Button aria-labelledby="shared-links-label" variant="outline">
            {localize('com_ui_manage')}
          </Button>
        </OGDialogTrigger>
        <OGDialogContent className={cn('w-11/12 max-w-6xl', isSmallScreen && 'px-1 pb-1')}>
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_nav_shared_links')}</OGDialogTitle>
          </OGDialogHeader>
          <DataTable
            columns={columns}
            data={displayData}
            isLoading={effectiveIsLoading}
            isFetching={effectiveIsFetching}
            config={{
              skeleton: { count: 11 },
              search: {
                filterColumn: 'title',
                enableSearch: true,
                debounce: 300,
              },
              selection: {
                enableRowSelection: false,
                showCheckboxes: false,
              },
            }}
            filterValue={searchValue}
            onFilterChange={handleSearchChange}
            fetchNextPage={handleFetchNextPage}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            sorting={sorting}
            onSortingChange={handleSortingChange}
          />
        </OGDialogContent>
      </OGDialog>
      <OGDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_delete_shared_link')}
          className="w-11/12 max-w-md"
          main={
            <div className="flex w-full flex-col items-center gap-2">
              <div className="grid w-full items-center gap-2">
                <Label className="text-left text-sm font-medium">
                  {localize('com_ui_delete_confirm')} <strong>{deleteRow?.title}</strong>
                </Label>
              </div>
            </div>
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
