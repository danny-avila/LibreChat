import { type FC } from 'react';
import { useRecoilValue } from 'recoil';
import { useLocation } from 'react-router-dom';
import { TConversation } from 'librechat-data-provider';
import { Menu, MenuButton, MenuItems } from '@headlessui/react';
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

  let conversation: TConversation | null | undefined;
  if (location.state?.from?.pathname.includes('/chat')) {
    conversation = globalConvo;
  } else {
    conversation = activeConvo;
  }

  return (
    <Menu as="div" className="group relative">
      {({ open }) => (
        <>
          <MenuButton
            className={cn(
              'mt-text-sm flex h-10 w-full items-center gap-2 rounded-lg p-2 text-sm transition-colors duration-200 hover:bg-surface-hover',
              open ? 'bg-surface-hover' : '',
            )}
            data-testid="bookmark-menu"
          >
            <div className="h-7 w-7 flex-shrink-0">
              <div className="relative flex h-full items-center justify-center rounded-full border border-border-medium bg-surface-primary-alt text-text-primary">
                {tags.length > 0 ? (
                  <BookmarkFilledIcon className="h-4 w-4" />
                ) : (
                  <BookmarkIcon className="h-4 w-4" />
                )}
              </div>
            </div>
            <div className="grow overflow-hidden whitespace-nowrap text-left text-sm font-medium text-text-primary">
              {tags.length > 0 ? tags.join(', ') : localize('com_ui_bookmarks')}
            </div>
          </MenuButton>
          <MenuItems className="absolute left-0 top-full z-[100] mt-1 w-full translate-y-0 overflow-hidden rounded-lg bg-header-primary p-1.5 shadow-lg outline-none">
            {data && conversation && (
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
          </MenuItems>
        </>
      )}
    </Menu>
  );
};

export default BookmarkNav;
