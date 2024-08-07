import { useEffect, useState, type FC } from 'react';
import { CrossCircledIcon } from '@radix-ui/react-icons';
import type { TConversation } from 'librechat-data-provider';
import { BookmarkItems, BookmarkItem } from '~/components/Bookmarks';

const BookmarkNavItems: FC<{
  conversation: TConversation;
  tags: string[];
  setTags: (tags: string[]) => void;
}> = ({ conversation, tags, setTags }) => {
  const [currentConversation, setCurrentConversation] = useState<TConversation>();

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

  return (
    <>
      <BookmarkItems
        tags={tags}
        handleSubmit={handleSubmit}
        highlightSelected={true}
        header={
          <BookmarkItem
            tag="Clear all"
            data-testid="bookmark-item-clear"
            handleSubmit={clear}
            selected={false}
            icon={<CrossCircledIcon className="h-4 w-4" />}
          />
        }
      />
    </>
  );
};

export default BookmarkNavItems;
