import { useState, type FC } from 'react';
import { useRecoilValue } from 'recoil';
import { useLocation } from 'react-router-dom';
import { TConversation } from 'librechat-data-provider';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';
import { BookmarkFilledIcon, BookmarkIcon } from '@radix-ui/react-icons';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import { useGetConversationTags } from '~/data-provider';
import BookmarkNavItems from './BookmarkNavItems';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

type BookmarkNavProps = {
  tags: string[];
  setTags: (tags: string[]) => void;
};

const BookmarkNav: FC<BookmarkNavProps> = ({ tags, setTags }: BookmarkNavProps) => {
  const localize = useLocalize();
  const location = useLocation();

  const { data } = useGetConversationTags();

  const activeConvo = useRecoilValue(store.conversationByIndex(0));
  const globalConvo = useRecoilValue(store.conversation) ?? ({} as TConversation);

  const [open, setIsOpen] = useState(false);

  let conversation: TConversation | null | undefined;
  if (location.state?.from?.pathname.includes('/chat')) {
    conversation = globalConvo;
  } else {
    conversation = activeConvo;
  }

  return (
    <Root open={open} onOpenChange={setIsOpen}>
      <Trigger asChild>
        <button
          className={cn(
            'relative mt-1 flex h-10 w-full cursor-pointer items-center gap-1 rounded-lg border-border-light bg-transparent px-1 py-2 text-text-primary transition-colors duration-200 focus-within:bg-surface-hover hover:bg-surface-hover',
            open ? 'bg-surface-hover' : '',
          )}
          id="show-bookmarks"
          data-testid="show-bookmarks"
          title={localize('com_ui_bookmarks')}
        >
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full p-1 text-text-primary">
            {tags.length > 0 ? (
              <BookmarkFilledIcon className="h-5 w-5" />
            ) : (
              <BookmarkIcon className="h-5 w-5" />
            )}
          </div>
          <div className="grow overflow-hidden whitespace-nowrap text-left text-sm text-text-primary">
            {tags.length > 0 ? tags.join(', ') : localize('com_ui_bookmarks')}
          </div>
        </button>
      </Trigger>
      <Portal>
        <div className="fixed left-0 top-0 z-auto translate-x-[268px] translate-y-[50px]">
          <Content
            side="bottom"
            align="start"
            className="mt-2 max-h-96 min-w-[240px] overflow-y-auto rounded-lg border border-border-medium bg-surface-primary-alt text-text-primary shadow-lg lg:max-h-96"
          >
            {data && conversation && (
              // Display bookmarks and highlight the selected tag
              <BookmarkContext.Provider value={{ bookmarks: data.filter((tag) => tag.count > 0) }}>
                <BookmarkNavItems
                  // Currently selected conversation
                  conversation={conversation}
                  // List of selected tags(string)
                  tags={tags}
                  // When a user selects a tag, this `setTags` function is called to refetch the list of conversations for the selected tag
                  setTags={setTags}
                />
              </BookmarkContext.Provider>
            )}
          </Content>
        </div>
      </Portal>
    </Root>
  );
};

export default BookmarkNav;
