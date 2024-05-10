import { useMemo, useState } from 'react';
import { MessageCircle, ArchiveRestore } from 'lucide-react';
import { useConversationsInfiniteQuery } from '~/data-provider';
import { useAuthContext, useLocalize, useNavScrolling } from '~/hooks';
import ArchiveButton from '~/components/Conversations/ArchiveButton';
import DeleteButton from '~/components/Conversations/DeleteButton';
import { Spinner } from '~/components/svg';
import { cn } from '~/utils';

export default function ArchivedChatsTable({ className }: { className?: string }) {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();
  const [showLoading, setShowLoading] = useState(false);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useConversationsInfiniteQuery(
    { pageNumber: '1', isArchived: true },
    { enabled: isAuthenticated },
  );

  const { containerRef, moveToTop } = useNavScrolling({
    setShowLoading,
    hasNextPage: hasNextPage,
    fetchNextPage: fetchNextPage,
    isFetchingNextPage: isFetchingNextPage,
  });

  const conversations = useMemo(
    () => data?.pages.flatMap((page) => page.conversations) || [],
    [data],
  );

  const classProp: { className?: string } = {
    className: 'p-1 hover:text-black dark:hover:text-white',
  };
  if (className) {
    classProp.className = className;
  }

  if (!conversations || conversations.length === 0) {
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
          {conversations.map((conversation) => (
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
                    {conversation.conversationId && (
                      <>
                        <ArchiveButton
                          className="hover:text-black dark:hover:text-white"
                          conversationId={conversation.conversationId}
                          retainView={moveToTop}
                          shouldArchive={false}
                          icon={<ArchiveRestore className="h-4 w-4 hover:text-gray-300" />}
                        />
                        <div className="h-5 w-5 hover:text-gray-300">
                          <DeleteButton
                            conversationId={conversation.conversationId}
                            retainView={moveToTop}
                            renaming={false}
                            title={conversation.title}
                            appendLabel={false}
                            className="group ml-4 flex w-full cursor-pointer items-center items-center gap-2 rounded text-sm hover:bg-gray-200 focus-visible:bg-gray-200 focus-visible:outline-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 dark:hover:bg-gray-600 dark:focus-visible:bg-gray-600"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(isFetchingNextPage || showLoading) && (
        <Spinner className={cn('m-1 mx-auto mb-4 h-4 w-4 text-black dark:text-white')} />
      )}
    </div>
  );
}
