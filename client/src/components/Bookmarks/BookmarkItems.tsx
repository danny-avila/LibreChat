import type { FC } from 'react';
import { useBookmarkContext } from '~/Providers/BookmarkContext';
import BookmarkItem from './BookmarkItem';
interface BookmarkItemsProps {
  tags: string[];
  handleSubmit: (tag?: string) => Promise<void>;
  header: React.ReactNode;
}

const BookmarkItems: FC<BookmarkItemsProps> = ({ tags, handleSubmit, header }) => {
  const { bookmarks } = useBookmarkContext();

  return (
    <>
      {header}
      {bookmarks.length > 0 && <div className="my-1.5 h-px" role="none" />}
      {bookmarks.map((bookmark) => (
        <BookmarkItem
          key={bookmark.tag}
          tag={bookmark.tag}
          selected={tags.includes(bookmark.tag)}
          handleSubmit={handleSubmit}
        />
      ))}
    </>
  );
};

export default BookmarkItems;
