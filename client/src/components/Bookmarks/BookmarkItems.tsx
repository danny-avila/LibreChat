import type { FC } from 'react';
import { useBookmarkContext } from '~/Providers/BookmarkContext';
import BookmarkItem from './BookmarkItem';
interface BookmarkItemsProps {
  tags: string[];
  handleSubmit: (tag: string) => Promise<void>;
  header: React.ReactNode;
  highlightSelected?: boolean;
}

const BookmarkItems: FC<BookmarkItemsProps> = ({
  tags,
  handleSubmit,
  header,
  highlightSelected,
}) => {
  const { bookmarks } = useBookmarkContext();

  return (
    <>
      {header}
      <div className="my-1.5 h-px bg-black/10 dark:bg-white/10" role="none" />
      {bookmarks.map((bookmark) => (
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
