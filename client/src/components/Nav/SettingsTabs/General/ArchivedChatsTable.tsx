import { useMemo, useState, useCallback } from 'react';
import { MessageCircle, ArchiveRestore } from 'lucide-react';
import { useConversationsInfiniteQuery } from '~/data-provider';
import { ConversationListResponse } from 'librechat-data-provider';
import { useAuthContext, useLocalize, useNavScrolling, useArchiveHandler } from '~/hooks';
import { DeleteButton } from '~/components/Conversations/ConvoOptions';
import { TooltipAnchor } from '~/components/ui';
import { Spinner } from '~/components/svg';
import { cn } from '~/utils';

export default function ArchivedChatsTable() {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();
  const [showLoading, setShowLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useConversationsInfiniteQuery(
    { pageNumber: '1', isArchived: true },
    { enabled: isAuthenticated },
  );

  const { containerRef, moveToTop } = useNavScrolling<ConversationListResponse>({
    setShowLoading,
    hasNextPage: hasNextPage,
    fetchNextPage: fetchNextPage,
    isFetchingNextPage: isFetchingNextPage,
  });

  const conversations = useMemo(
    () => data?.pages.flatMap((page) => page.conversations) || [],
    [data],
  );

  const archiveHandler = useArchiveHandler(conversationId ?? '', false, moveToTop);

  if (!data || conversations.length === 0) {
    return <div className="text-gray-300">{localize('com_nav_archived_chats_empty')}</div>;
  }

  return (
    <div
      className={cn(
        'grid w-full gap-2',
        'flex-1 flex-col overflow-y-auto pr-2 transition-opacity duration-500',
        'max-h-[350px]',
      )}
      ref={containerRef}
    >
      <table className="table-fixed text-left">
        <thead className="sticky top-0 bg-white dark:bg-gray-700">
          <tr className="border-b border-gray-200 text-sm font-semibold text-gray-500 dark:border-white/10 dark:text-gray-200">
            <th className="p-3">{localize('com_nav_archive_name')}</th>
            <th className="p-3">{localize('com_nav_archive_created_at')}</th>
          </tr>
        </thead>
        <tbody>
          {conversations.map((conversation) => {
            if (!conversation.conversationId) {
              return null;
            }
            return (
              <tr
                key={conversation.conversationId}
                className="border-b border-gray-200 text-sm font-normal dark:border-white/10"
              >
                <td className="flex items-center py-3 text-blue-800/70 dark:text-blue-500">
                  <MessageCircle className="mr-1 h-5 w-5" />
                  {conversation.title}
                </td>
                <td className="p-1">
                  <div className="flex justify-between">
                    <div className="flex justify-start dark:text-gray-200">
                      {new Date(conversation.createdAt).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                    <div className="ml-auto mr-4 flex items-center justify-end gap-1 text-gray-400">
                      <TooltipAnchor
                        description={localize('com_ui_unarchive')}
                        onClick={() => {
                          setConversationId(conversation.conversationId);
                          archiveHandler();
                        }}
                        className="cursor-pointer hover:text-black dark:hover:text-white"
                      >
                        <ArchiveRestore className="size-4 hover:text-gray-300" />
                      </TooltipAnchor>
                      <div className="size-5 hover:text-gray-300">
                        <DeleteButton
                          conversationId={conversation.conversationId}
                          retainView={moveToTop}
                          title={conversation.title ?? ''}
                        />
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(isFetchingNextPage || showLoading) && (
        <Spinner className={cn('m-1 mx-auto mb-4 h-4 w-4 text-black dark:text-white')} />
      )}
    </div>
  );
}
