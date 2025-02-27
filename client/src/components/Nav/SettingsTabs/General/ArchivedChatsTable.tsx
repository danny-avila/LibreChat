import { useState, useCallback, useMemo } from 'react';
import {
  Search,
  TrashIcon,
  ChevronLeft,
  ChevronRight,
  // ChevronsLeft,
  // ChevronsRight,
  MessageCircle,
  ArchiveRestore,
} from 'lucide-react';
import type { TConversation } from 'librechat-data-provider';
import {
  Table,
  Input,
  Button,
  TableRow,
  Skeleton,
  OGDialog,
  Separator,
  TableCell,
  TableBody,
  TableHead,
  TableHeader,
  TooltipAnchor,
  OGDialogTrigger,
} from '~/components';
import { useConversationsInfiniteQuery, useArchiveConvoMutation } from '~/data-provider';
import { DeleteConversationDialog } from '~/components/Conversations/ConvoOptions';
import { useAuthContext, useLocalize, useMediaQuery } from '~/hooks';
import { cn } from '~/utils';

export default function ArchivedChatsTable() {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const [isOpened, setIsOpened] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useConversationsInfiniteQuery(
      { pageNumber: currentPage.toString(), isArchived: true },
      { enabled: isAuthenticated && isOpened },
    );
  const mutation = useArchiveConvoMutation();
  const handleUnarchive = useCallback(
    (conversationId: string) => {
      mutation.mutate({ conversationId, isArchived: false });
    },
    [mutation],
  );

  const conversations = useMemo(
    () => data?.pages[currentPage - 1]?.conversations ?? [],
    [data, currentPage],
  );
  const totalPages = useMemo(() => Math.ceil(Number(data?.pages[0].pages ?? 1)) ?? 1, [data]);

  const handleChatClick = useCallback((conversationId: string) => {
    if (!conversationId) {
      return;
    }
    window.open(`/c/${conversationId}`, '_blank');
  }, []);

  const handlePageChange = useCallback(
    (newPage: number) => {
      setCurrentPage(newPage);
      if (!(hasNextPage ?? false)) {
        return;
      }
      fetchNextPage({ pageParam: newPage });
    },
    [fetchNextPage, hasNextPage],
  );

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  }, []);

  const getRandomWidth = () => Math.floor(Math.random() * (400 - 170 + 1)) + 170;

  const skeletons = Array.from({ length: 11 }, (_, index) => {
    const randomWidth = getRandomWidth();
    return (
      <div key={index} className="flex h-10 w-full items-center">
        <div className="flex w-[410px] items-center">
          <Skeleton className="h-4" style={{ width: `${randomWidth}px` }} />
        </div>
        <div className="flex grow justify-center">
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="mr-2 flex justify-end">
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
    );
  });

  if (isLoading || isFetchingNextPage) {
    return <div className="text-text-secondary">{skeletons}</div>;
  }

  if (!data || (conversations.length === 0 && totalPages === 0)) {
    return <div className="text-text-secondary">{localize('com_nav_archived_chats_empty')}</div>;
  }

  return (
    <div
      className={cn(
        'grid w-full gap-2',
        'flex-1 flex-col overflow-y-auto pr-2 transition-opacity duration-500',
        'max-h-[629px]',
      )}
      onMouseEnter={() => setIsOpened(true)}
    >
      <div className="flex items-center">
        <Search className="size-4 text-text-secondary" />
        <Input
          type="text"
          placeholder={localize('com_nav_search_placeholder')}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full border-none placeholder:text-text-secondary"
        />
      </div>
      <Separator />
      {conversations.length === 0 ? (
        <div className="mt-4 text-text-secondary">{localize('com_nav_no_search_results')}</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn('p-4', isSmallScreen ? 'w-[70%]' : 'w-[50%]')}>
                  {localize('com_nav_archive_name')}
                </TableHead>
                {!isSmallScreen && (
                  <TableHead className="w-[35%] p-1">
                    {localize('com_nav_archive_created_at')}
                  </TableHead>
                )}
                <TableHead className={cn('p-1 text-right', isSmallScreen ? 'w-[30%]' : 'w-[15%]')}>
                  {localize('com_assistants_actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversations.map((conversation: TConversation) => (
                <TableRow key={conversation.conversationId} className="hover:bg-transparent">
                  <TableCell className="py-3 text-text-primary">
                    <button
                      type="button"
                      className="flex max-w-full"
                      aria-label="Open conversation in a new tab"
                      onClick={() => {
                        const conversationId = conversation.conversationId ?? '';
                        if (!conversationId) {
                          return;
                        }
                        handleChatClick(conversationId);
                      }}
                    >
                      <MessageCircle className="mr-1 h-5 min-w-[20px]" />
                      <u className="truncate">{conversation.title}</u>
                    </button>
                  </TableCell>
                  {!isSmallScreen && (
                    <TableCell className="p-1">
                      <div className="flex justify-between">
                        <div className="flex justify-start text-text-secondary">
                          {new Date(conversation.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      </div>
                    </TableCell>
                  )}
                  <TableCell
                    className={cn(
                      'flex items-center gap-1 p-1',
                      isSmallScreen ? 'justify-end' : 'justify-end gap-2',
                    )}
                  >
                    <TooltipAnchor
                      description={localize('com_ui_unarchive')}
                      render={
                        <Button
                          type="button"
                          aria-label="Unarchive conversation"
                          variant="ghost"
                          size="icon"
                          className={cn('size-8', isSmallScreen && 'size-7')}
                          onClick={() => {
                            const conversationId = conversation.conversationId ?? '';
                            if (!conversationId) {
                              return;
                            }
                            handleUnarchive(conversationId);
                          }}
                        >
                          <ArchiveRestore className={cn('size-4', isSmallScreen && 'size-3.5')} />
                        </Button>
                      }
                    />

                    <OGDialog>
                      <OGDialogTrigger asChild>
                        <TooltipAnchor
                          description={localize('com_ui_delete')}
                          render={
                            <Button
                              type="button"
                              aria-label="Delete archived conversation"
                              variant="ghost"
                              size="icon"
                              className={cn('size-8', isSmallScreen && 'size-7')}
                            >
                              <TrashIcon className={cn('size-4', isSmallScreen && 'size-3.5')} />
                            </Button>
                          }
                        />
                      </OGDialogTrigger>
                      <DeleteConversationDialog
                        conversationId={conversation.conversationId ?? ''}
                        retainView={refetch}
                        title={conversation.title ?? ''}
                      />
                    </OGDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-end gap-6 px-2 py-4">
            <div className="text-sm font-bold text-text-primary">
              {localize('com_ui_page')} {currentPage} {localize('com_ui_of')} {totalPages}
            </div>
            <div className="flex space-x-2">
              {/* <Button
                variant="outline"
                size="icon"
                aria-label="Go to the previous 10 pages"
                onClick={() => handlePageChange(Math.max(currentPage - 10, 1))}
                disabled={currentPage === 1}
              >
                <ChevronsLeft className="size-4" />
              </Button> */}
              <Button
                variant="outline"
                size="icon"
                aria-label="Go to the previous page"
                onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Go to the next page"
                onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="size-4" />
              </Button>
              {/* <Button
                variant="outline"
                size="icon"
                aria-label="Go to the next 10 pages"
                onClick={() => handlePageChange(Math.min(currentPage + 10, totalPages))}
                disabled={currentPage === totalPages}
              >
                <ChevronsRight className="size-4" />
              </Button> */}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
