import { useConversationTagsQuery } from '~/data-provider';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import BookmarkTable from './BookmarkTable';

const BookmarkPanel = () => {
  const { data } = useConversationTagsQuery();

  return (
    <div className="h-auto max-w-full overflow-x-hidden">
      <BookmarkContext.Provider value={{ bookmarks: data || [] }}>
        <BookmarkTable />
      </BookmarkContext.Provider>
    </div>
  );
};
export default BookmarkPanel;
