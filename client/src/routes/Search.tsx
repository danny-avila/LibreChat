import { useMemo } from 'react';
import MinimalMessagesWrapper from '~/components/Chat/Messages/MinimalMessages';
import SearchMessage from '~/components/Chat/Messages/SearchMessage';
import { useSearchContext, useFileMapContext } from '~/Providers';
import { useNavScrolling, useLocalize } from '~/hooks';
import { buildTree } from '~/utils';

export default function Search() {
  const localize = useLocalize();
  const fileMap = useFileMapContext();
  const { searchQuery, searchQueryRes } = useSearchContext();

  const { containerRef } = useNavScrolling({
    setShowLoading: () => ({}),
    hasNextPage: searchQueryRes?.hasNextPage,
    fetchNextPage: searchQueryRes?.fetchNextPage,
    isFetchingNextPage: searchQueryRes?.isFetchingNextPage,
  });

  const messages = useMemo(() => {
    const msgs = searchQueryRes?.data?.pages.flatMap((page) => page.messages) || [];
    const dataTree = buildTree({ messages: msgs, fileMap });
    return dataTree?.length === 0 ? null : dataTree ?? null;
  }, [fileMap, searchQueryRes?.data?.pages]);

  if (!searchQuery || !searchQueryRes?.data) {
    return null;
  }

  return (
    <MinimalMessagesWrapper ref={containerRef} className="pt-4">
      {(messages && messages?.length == 0) || messages === null ? (
        <div className="my-auto flex h-full w-full items-center justify-center gap-1 bg-gray-50 p-3 text-lg text-gray-500 dark:border-gray-800/50 dark:bg-gray-800 dark:text-gray-300">
          {localize('com_ui_nothing_found')}
        </div>
      ) : (
        messages?.map((message) => <SearchMessage key={message.messageId} message={message} />)
      )}
      <div className="absolute bottom-0 left-0 right-0 h-[5%] bg-gradient-to-t from-gray-800 to-transparent" />
    </MinimalMessagesWrapper>
  );
}
