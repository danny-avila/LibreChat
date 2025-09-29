import { useState, useCallback, useMemo } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { TrashIcon, ArchiveRestore } from 'lucide-react';
import { useQueryClient, InfiniteData } from '@tanstack/react-query';
import {
  Button,
  OGDialog,
  OGDialogTrigger,
  OGDialogTemplate,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Label,
  TooltipAnchor,
  Spinner,
  useToastContext,
  useMediaQuery,
  DataTable,
  type TableColumn,
} from '@librechat/client';
import type { ConversationListParams, TConversation } from 'librechat-data-provider';
import type { SortingState } from '@tanstack/react-table';
import {
  useArchiveConvoMutation,
  useConversationsInfiniteQuery,
  useDeleteConversationMutation,
} from '~/data-provider';
import { MinimalIcon } from '~/components/Endpoints';
import { NotificationSeverity } from '~/common';
import { formatDate, cn } from '~/utils';
import { useLocalize } from '~/hooks';

const DEFAULT_PARAMS = {
  isArchived: true,
  sortBy: 'createdAt',
  sortDirection: 'desc',
  search: '',
} as const satisfies ConversationListParams;

type SortKey = 'createdAt' | 'title';
const isSortKey = (v: string): v is SortKey => v === 'createdAt' || v === 'title';

const defaultSort: SortingState = [
  {
    id: 'createdAt',
    desc: true,
  },
];

/**
 * Helper: remove a conversation from all infinite queries whose key starts with the provided root
 */
function removeConversationFromInfinite(
  queryClient: ReturnType<typeof useQueryClient>,
  rootKey: string,
  conversationId: string,
) {
  const queries = queryClient.getQueryCache().findAll([rootKey], { exact: false });
  for (const query of queries) {
    queryClient.setQueryData<
      InfiniteData<{ conversations: TConversation[]; nextCursor?: string | null }>
    >(query.queryKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          conversations: page.conversations.filter((c) => c.conversationId !== conversationId),
        })),
      };
    });
  }
}

export default function ArchivedChatsTable() {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { showToast } = useToastContext();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState<TConversation | null>(null);
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);

  const [queryParams, setQueryParams] = useState<ConversationListParams>(DEFAULT_PARAMS);
  const [sorting, setSorting] = useState<SortingState>(defaultSort);
  const [searchValue, setSearchValue] = useState('');

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useConversationsInfiniteQuery(queryParams, {
      enabled: isOpen,
      keepPreviousData: false,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    });

  const handleSearchChange = useCallback((value: string) => {
    const trimmedValue = value.trim();
    setSearchValue(trimmedValue);
    setQueryParams((prev) => ({
      ...prev,
      search: trimmedValue,
    }));
  }, []);

  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      setSorting((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        const primary = next[0];
        setQueryParams((p) => {
          let sortBy: SortKey = 'createdAt';
          let sortDirection: 'asc' | 'desc' = 'desc';
          if (primary && isSortKey(primary.id)) {
            sortBy = primary.id;
            sortDirection = primary.desc ? 'desc' : 'asc';
          }
          return {
            ...p,
            sortBy,
            sortDirection,
          };
        });
        return next;
      });
    },
    [],
  );

  const flattenedConversations = useMemo(
    () => data?.pages?.flatMap((page) => page?.conversations?.filter(Boolean) ?? []) ?? [],
    [data?.pages],
  );

  const unarchiveMutation = useArchiveConvoMutation({
    onSuccess: (_res, variables) => {
      const { conversationId } = variables;
      if (conversationId) {
        removeConversationFromInfinite(
          queryClient,
          QueryKeys.archivedConversations,
          conversationId,
        );
      }
      queryClient.invalidateQueries([QueryKeys.allConversations]);
      setUnarchivingId(null);
    },
    onError: () => {
      showToast({
        message: localize('com_ui_unarchive_error'),
        severity: NotificationSeverity.ERROR,
      });
      setUnarchivingId(null);
    },
  });

  const deleteMutation = useDeleteConversationMutation({
    onSuccess: (_data, variables) => {
      const { conversationId } = variables;
      if (conversationId) {
        removeConversationFromInfinite(
          queryClient,
          QueryKeys.archivedConversations,
          conversationId,
        );
      }
      showToast({
        message: localize('com_ui_archived_conversation_delete_success'),
        severity: NotificationSeverity.SUCCESS,
      });
      setIsDeleteOpen(false);
    },
    onError: () => {
      showToast({
        message: localize('com_ui_archive_delete_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const handleFetchNextPage = useCallback(async () => {
    if (!hasNextPage || isFetchingNextPage) return;
    await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const effectiveIsLoading = isLoading;
  const effectiveIsFetching = isFetchingNextPage;

  const confirmDelete = useCallback(() => {
    if (!deleteRow?.conversationId) {
      showToast({
        message: localize('com_ui_convo_delete_error'),
        severity: NotificationSeverity.WARNING,
      });
      return;
    }
    deleteMutation.mutate({ conversationId: deleteRow.conversationId });
  }, [deleteMutation, deleteRow, localize, showToast]);

  const handleUnarchive = useCallback(
    (conversationId: string) => {
      setUnarchivingId(conversationId);
      unarchiveMutation.mutate(
        { conversationId, isArchived: false },
        { onSettled: () => setUnarchivingId(null) },
      );
    },
    [unarchiveMutation],
  );

  const columns: TableColumn<Record<string, unknown>, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'title',
        accessorFn: (row: Record<string, unknown>): unknown => {
          const convo = row as TConversation;
          return convo.title;
        },
        header: () => (
          <span className="text-xs text-text-primary sm:text-sm">
            {localize('com_nav_archive_name')}
          </span>
        ),
        cell: ({ row }) => {
          const convo = row.original as TConversation;
          const { conversationId, title } = convo;
          return (
            <div className="flex items-center gap-2">
              <MinimalIcon
                endpoint={convo.endpoint}
                size={28}
                isCreatedByUser={false}
                iconClassName="size-4"
                aria-hidden="true"
              />
              <a
                href={`/c/${conversationId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center truncate underline"
                aria-label={localize('com_ui_open_conversation', { 0: title })}
              >
                {title}
              </a>
            </div>
          );
        },
        meta: {
          width: 65,
          className: 'min-w-[150px]',
        },
        enableSorting: true,
      },
      {
        accessorKey: 'createdAt',
        accessorFn: (row: Record<string, unknown>): unknown => {
          const convo = row as TConversation;
          return convo.createdAt;
        },
        header: () => (
          <span className="text-xs text-text-primary sm:text-sm">
            {localize('com_nav_archive_created_at')}
          </span>
        ),
        cell: ({ row }) => {
          const convo = row.original as TConversation;
          return formatDate(convo.createdAt?.toString() ?? '', isSmallScreen);
        },
        meta: {
          width: 20,
          className: 'min-w-[6rem]',
          desktopOnly: true,
        },
        enableSorting: true,
      },
      {
        id: 'actions',
        accessorFn: () => null,
        header: () => (
          <span className="text-xs text-text-primary sm:text-sm">
            {localize('com_assistants_actions')}
          </span>
        ),
        cell: ({ row }) => {
          const convo = row.original as TConversation;
          const { title } = convo;
          const isRowUnarchiving = unarchivingId === convo.conversationId;

          return (
            <div className="flex items-center gap-1.5 md:gap-2">
              <TooltipAnchor
                description={localize('com_ui_unarchive')}
                render={
                  <Button
                    variant="ghost"
                    className="h-9 w-9 p-0 hover:bg-surface-hover md:h-8 md:w-8"
                    onClick={() => {
                      const conversationId = convo.conversationId;
                      if (!conversationId) return;
                      handleUnarchive(conversationId);
                    }}
                    disabled={isRowUnarchiving}
                    aria-label={localize('com_ui_unarchive_conversation_title', { 0: title })}
                  >
                    {isRowUnarchiving ? <Spinner /> : <ArchiveRestore className="size-4" />}
                  </Button>
                }
              />
              <TooltipAnchor
                description={localize('com_ui_delete')}
                render={
                  <Button
                    variant="destructive"
                    className="h-9 w-9 p-0 md:h-8 md:w-8"
                    onClick={() => {
                      setDeleteRow(convo);
                      setIsDeleteOpen(true);
                    }}
                    aria-label={localize('com_ui_delete_conversation_title', { 0: title })}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                }
              />
            </div>
          );
        },
        meta: {
          width: 30,
          className: 'min-w-[5rem]',
        },
        enableSorting: false,
      },
    ],
    [isSmallScreen, localize, handleUnarchive, unarchivingId],
  );

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_archived_chats')}</div>
      <OGDialog open={isOpen} onOpenChange={setIsOpen}>
        <OGDialogTrigger asChild>
          <Button variant="outline" aria-label="Archived chats">
            {localize('com_ui_manage')}
          </Button>
        </OGDialogTrigger>
        <OGDialogContent className={cn('w-11/12 max-w-6xl', isSmallScreen && 'px-1 pb-1')}>
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_nav_archived_chats')}</OGDialogTitle>
          </OGDialogHeader>
          <DataTable
            columns={columns}
            data={flattenedConversations}
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
                enableRowSelection: true,
                showCheckboxes: true,
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
          title={localize('com_ui_delete_archived_chats')}
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
