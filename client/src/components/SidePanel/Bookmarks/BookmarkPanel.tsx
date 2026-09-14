import { useMemo } from 'react';
import { useConversationTagCatalogQuery, useConversationTagsQuery } from '~/data-provider';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import BookmarkTable from './BookmarkTable';

const BookmarkPanel = () => {
  const { data: bookmarks = [], isLoading } = useConversationTagCatalogQuery();
  const counts = useConversationTagsQuery({
    staleTime: Infinity,
    refetchOnMount: 'always',
  });
  const countsCurrent = !counts.isFetching && !counts.isStale && !counts.isError;
  const countsById = useMemo(
    () =>
      countsCurrent
        ? new Map(counts.data?.map((bookmark) => [bookmark._id, bookmark.count]))
        : undefined,
    [counts.data, countsCurrent],
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden pt-2">
      <BookmarkContext.Provider value={{ bookmarks }}>
        <BookmarkTable isLoading={isLoading} countsCurrent={countsCurrent} counts={countsById} />
      </BookmarkContext.Provider>
    </div>
  );
};
export default BookmarkPanel;
