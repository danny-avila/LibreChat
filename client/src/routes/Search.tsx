import { useEffect, useMemo } from 'react';
import type { FetchNextPageOptions } from '@tanstack/react-query';
import { useToastContext, useSearchContext, useFileMapContext } from '~/Providers';
import MinimalMessagesWrapper from '~/components/Chat/Messages/MinimalMessages';
import SearchMessage from '~/components/Chat/Messages/SearchMessage';
import { useNavScrolling, useLocalize } from '~/hooks';
import { Spinner } from '~/components';
import { buildTree } from '~/utils';
import { useRecoilValue } from 'recoil';
import store from '~/store';

export default function Search() {
  const localize = useLocalize();
  const fileMap = useFileMapContext();
  const { showToast } = useToastContext();
  const { searchQuery, searchQueryRes } = useSearchContext();
  const isSearchTyping = useRecoilValue(store.isSearchTyping);

  const { containerRef } = useNavScrolling({
    nextCursor: searchQueryRes?.data?.pages[searchQueryRes.data.pages.length - 1]?.nextCursor,
    setShowLoading: () => ({}),
    fetchNextPage: searchQueryRes?.fetchNextPage
      ? (options?: FetchNextPageOptions) => searchQueryRes.fetchNextPage(options)
      : undefined,
    isFetchingNext: searchQueryRes?.isFetchingNextPage ?? false,
  });

  useEffect(() => {
    if (searchQueryRes?.error) {
      showToast({ message: 'An error occurred during search', status: 'error' });
    }
  }, [searchQueryRes?.error, showToast]);

  const messages = useMemo(() => {
    const msgs = searchQueryRes?.data?.pages.flatMap((page) => page.messages) || [];
    const dataTree = buildTree({ messages: msgs, fileMap });
    return dataTree?.length === 0 ? null : (dataTree ?? null);
  }, [fileMap, searchQueryRes?.data?.pages]);

  if (!searchQuery || !searchQueryRes?.data) {
    return null;
  }

  if (isSearchTyping || searchQueryRes.isInitialLoading || searchQueryRes.isLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    );
  }

  return (
    <MinimalMessagesWrapper ref={containerRef} className="relative flex h-full pt-4">
      {(messages && messages.length == 0) || messages == null ? (
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
          {searchQueryRes.isFetchingNextPage && (
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
