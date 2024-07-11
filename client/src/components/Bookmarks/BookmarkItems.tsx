import type { FC } from 'react';
import { useBookmarkContext } from '~/Providers/BookmarkContext';
import BookmarkItem from './BookmarkItem';

const BookmarkItems: FC<{
  tags: string[];
  handleSubmit: (tag: string) => Promise<void>;
  header: React.ReactNode;
  highlightSelected?: boolean;
}> = ({ tags, handleSubmit, header, highlightSelected }) => {
  const { bookmarks } = useBookmarkContext();
  return (
    <>
      {header}
      <div className="my-1.5 h-px bg-black/10 dark:bg-white/10" role="none" />
      {bookmarks.length > 0 &&
        bookmarks.map((bookmark) => (
          <BookmarkItem
            key={bookmark.tag}
            tag={bookmark.tag}
            selected={tags.includes(bookmark.tag)}
            count={bookmark.count}
            handleSubmit={handleSubmit}
            highlightSelected={highlightSelected}
          />
        ))}
    </>
  );
};
export default BookmarkItems;
