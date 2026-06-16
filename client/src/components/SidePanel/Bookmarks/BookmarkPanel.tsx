import { useConversationTagsQuery } from '~/data-provider';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import BookmarkTable from './BookmarkTable';

const BookmarkPanel = ({ noPadding = false }: { noPadding?: boolean }) => {
  const { data } = useConversationTagsQuery();

  return (
    <div className={noPadding ? 'h-auto max-w-full overflow-x-visible' : 'h-auto max-w-full overflow-x-visible px-3 pb-3 pt-2'}>
      <BookmarkContext.Provider value={{ bookmarks: data || [] }}>
        <BookmarkTable />
      </BookmarkContext.Provider>
    </div>
  );
};
export default BookmarkPanel;
