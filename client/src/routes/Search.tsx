import { useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import MinimalMessagesWrapper from '~/components/Chat/Messages/MinimalMessages';
import { useNavScrolling, useLocalize, useAuthContext } from '~/hooks';
import SearchMessage from '~/components/Chat/Messages/SearchMessage';
import { useMessagesInfiniteQuery } from '~/data-provider';
import { useToastContext } from '~/Providers';
import { Spinner } from '~/components';
import store from '~/store';

export default function Search() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { isAuthenticated } = useAuthContext();
  const isSearchTyping = useRecoilValue(store.isSearchTyping);
  const searchQuery = useRecoilValue(store.searchQuery);

  const { containerRef } = useNavScrolling({
    nextCursor: undefined,
    setShowLoading: () => ({}),
    fetchNextPage: undefined,
    isFetchingNext: false,
  });

  const { data: searchMessages, isLoading } = useMessagesInfiniteQuery(
    {
      search: searchQuery || undefined,
    },
    {
      enabled: isAuthenticated,
      staleTime: 30000,
      cacheTime: 300000,
    },
  );

  useEffect(() => {
    if (!searchMessages && searchQuery) {
      showToast({ message: 'An error occurred during search', status: 'error' });
    }
  }, [searchMessages, searchQuery, showToast]);

  if (!searchQuery) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    );
  }

  return (
    <MinimalMessagesWrapper ref={containerRef} className="relative flex h-full pt-4">
      {!searchMessages ||
      !searchMessages.pages ||
      searchMessages.pages.flatMap((page) => page.messages).length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-lg bg-white p-6 text-lg text-gray-500 dark:border-gray-800/50 dark:bg-gray-800 dark:text-gray-300">
              {localize('com_ui_nothing_found')}
            </div>
          </div>
        ) : (
          <>
            {searchMessages.pages
              .flatMap((page) => page.messages)
              .map((msg) => (
                <SearchMessage key={msg.messageId} message={msg} />
              ))}
          </>
        )}
      <div className="absolute bottom-0 left-0 right-0 h-[5%] bg-gradient-to-t from-gray-50 to-transparent dark:from-gray-800" />
    </MinimalMessagesWrapper>
  );
}
