import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import MinimalMessagesWrapper from '~/components/Chat/Messages/MinimalMessages';
import SearchMessage from '~/components/Chat/Messages/SearchMessage';
import { useSearchContext, useFileMapContext } from '~/Providers';
import { useNavScrolling, useLocalize } from '~/hooks';
import { buildTree } from '~/utils';
import store from '~/store';

export default function Search() {
  const localize = useLocalize();
  const fileMap = useFileMapContext();
  const { searchQuery, searchQueryRes } = useSearchContext();
  const isEncryptionEnabled = useRecoilValue(store.isEncryptionEnabled);

  const { containerRef } = useNavScrolling({
    setShowLoading: () => ({}),
    hasNextPage: searchQueryRes?.hasNextPage ?? false,
    fetchNextPage: searchQueryRes?.fetchNextPage,
    isFetchingNextPage: searchQueryRes?.isFetchingNextPage ?? false,
  });

  const messages = useMemo(() => {
    if (isEncryptionEnabled) {
      return null;
    }
    const msgs = searchQueryRes?.data?.pages.flatMap((page) => page.messages) || [];
    const dataTree = buildTree({ messages: msgs, fileMap });
    return dataTree?.length === 0 ? null : (dataTree ?? null);
  }, [fileMap, searchQueryRes?.data?.pages, isEncryptionEnabled]);

  if (isEncryptionEnabled) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="rounded-lg bg-white p-6 text-center shadow-lg dark:bg-gray-800">
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200">
            Search Unavailable
          </h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Search is disabled when encryption is enabled
          </p>
        </div>
      </div>
    );
  }

  if (!searchQuery || !searchQueryRes?.data) {
    return null;
  }

  return (
    <MinimalMessagesWrapper ref={containerRef} className="pt-4">
      {(messages && messages.length === 0) || messages == null ? (
        <div className="my-auto flex h-full w-full items-center justify-center gap-1 bg-white p-3 text-lg text-gray-500 dark:border-gray-800/50 dark:bg-gray-800 dark:text-gray-300">
          {localize('com_ui_nothing_found')}
        </div>
      ) : (
        messages.map((message) => <SearchMessage key={message.messageId} message={message} />)
      )}
      <div className="absolute bottom-0 left-0 right-0 h-[5%] bg-gradient-to-t from-gray-50 to-transparent dark:from-gray-800" />
    </MinimalMessagesWrapper>
  );
}