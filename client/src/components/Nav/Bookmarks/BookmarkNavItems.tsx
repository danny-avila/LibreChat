import { useEffect, useState, type FC } from 'react';
import { CrossCircledIcon } from '@radix-ui/react-icons';
import type { TConversation } from 'librechat-data-provider';
import { useBookmarkContext } from '~/Providers/BookmarkContext';
import { BookmarkItems, BookmarkItem } from '~/components/Bookmarks';
import { useLocalize } from '~/hooks';

const BookmarkNavItems: FC<{
  conversation: TConversation;
  tags: string[];
  setTags: (tags: string[]) => void;
}> = ({ conversation, tags, setTags }) => {
  const [currentConversation, setCurrentConversation] = useState<TConversation>();
  const { bookmarks } = useBookmarkContext();
  const localize = useLocalize();

  useEffect(() => {
    if (!currentConversation) {
      setCurrentConversation(conversation);
    }
  }, [conversation, currentConversation]);

  const getUpdatedSelected = (tag: string) => {
    if (tags.some((selectedTag) => selectedTag === tag)) {
      return tags.filter((selectedTag) => selectedTag !== tag);
    } else {
      return [...(tags || []), tag];
    }
  };

  const handleSubmit = (tag: string) => {
    const updatedSelected = getUpdatedSelected(tag);
    setTags(updatedSelected);
    return Promise.resolve();
  };

  const clear = () => {
    setTags([]);
    return Promise.resolve();
  };

  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-col">
        <BookmarkItem
          tag={localize('com_ui_clear_all')}
          data-testid="bookmark-item-clear"
          handleSubmit={clear}
          selected={false}
          icon={<CrossCircledIcon className="size-4" />}
        />
        <BookmarkItem
          tag={localize('com_ui_no_bookmarks')}
          data-testid="bookmark-item-no-bookmarks"
          handleSubmit={() => Promise.resolve()}
          selected={false}
          icon={'🤔'}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <BookmarkItems
        tags={tags}
        handleSubmit={handleSubmit}
        header={
          <BookmarkItem
            tag={localize('com_ui_clear_all')}
            data-testid="bookmark-item-clear"
            handleSubmit={clear}
            selected={false}
            icon={<CrossCircledIcon className="size-4" />}
          />
        }
      />
    </div>
  );
};

export default BookmarkNavItems;
