import { useEffect, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import MinimalMessagesWrapper from '~/components/Chat/Messages/MinimalMessages';
import { useNavScrolling, useLocalize, useAuthContext } from '~/hooks';
import SearchMessage from '~/components/Chat/Messages/SearchMessage';
import { useToastContext, useFileMapContext } from '~/Providers';
import { useMessagesInfiniteQuery } from '~/data-provider';
import { Spinner } from '~/components';
import { buildTree } from '~/utils';
import store from '~/store';

export default function Search() {
  const localize = useLocalize();
  const fileMap = useFileMapContext();
  const { showToast } = useToastContext();
  const { isAuthenticated } = useAuthContext();
  const search = useRecoilValue(store.search);
  const searchQuery = search.debouncedQuery;

  const {
    data: searchMessages,
    isLoading,
    isError,
    fetchNextPage,
    isFetchingNextPage,
    hasNextPage,
  } = useMessagesInfiniteQuery(
    {
      search: searchQuery || undefined,
    },
    {
      enabled: isAuthenticated && !!searchQuery,
      staleTime: 30000,
      cacheTime: 300000,
    },
  );

  const { containerRef } = useNavScrolling({
    nextCursor: searchMessages?.pages[searchMessages.pages.length - 1]?.nextCursor,
    setShowLoading: () => ({}),
    fetchNextPage: fetchNextPage,
    isFetchingNext: isFetchingNextPage,
  });

  const messages = useMemo(() => {
    const msgs = searchMessages?.pages.flatMap((page) => page.messages) || [];
    const dataTree = buildTree({ messages: msgs, fileMap });
    return dataTree?.length === 0 ? null : (dataTree ?? null);
  }, [fileMap, searchMessages?.pages]);

  useEffect(() => {
    if (isError && searchQuery) {
      showToast({ message: 'An error occurred during search', status: 'error' });
    }
  }, [isError, searchQuery, showToast]);

  const isSearchLoading = search.isTyping || isLoading || isFetchingNextPage;

  if (isSearchLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    );
  }

  if (!searchQuery) {
    return null;
  }

  return (
    <MinimalMessagesWrapper ref={containerRef} className="relative flex h-full pt-4">
      {(messages && messages.length === 0) || messages == null ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg bg-white p-6 text-lg text-gray-500 dark:border-gray-800/50 dark:bg-gray-800 dark:text-gray-300">
            {localize('com_ui_nothing_found')}
          </div>
        </div>
      ) : (
        <>
          {messages.map((msg) => (
            <SearchMessage key={msg.messageId} message={msg} />
          ))}
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Spinner className="text-text-primary" />
            </div>
          )}
        </>
      )}
      <div className="absolute bottom-0 left-0 right-0 h-[5%] bg-gradient-to-t from-gray-50 to-transparent dark:from-gray-800" />
    </MinimalMessagesWrapper>
  );
}
