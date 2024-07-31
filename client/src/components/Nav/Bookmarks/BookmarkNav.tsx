import { useState, type FC } from 'react';
import { useRecoilValue } from 'recoil';
import { useLocation } from 'react-router-dom';
import { TConversation } from 'librechat-data-provider';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';
import { BookmarkFilledIcon, BookmarkIcon } from '@radix-ui/react-icons';
import { useGetConversationTags } from 'librechat-data-provider/react-query';
import { BookmarkContext } from '~/Providers/BookmarkContext';
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

  // Hide the button if there are no tags
  if (!data || !data.some((tag) => tag.count > 0)) {
    return null;
  }

  return (
    <Root open={open} onOpenChange={setIsOpen}>
      <Trigger asChild>
        <button
          className={cn(
            'group-ui-open:bg-gray-100 dark:group-ui-open:bg-gray-700 duration-350 mt-text-sm flex h-auto w-full items-center gap-2 rounded-lg p-2 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800',
            open ? 'bg-gray-100 dark:bg-gray-800' : '',
          )}
          id="presets-button"
          data-testid="presets-button"
          title={localize('com_endpoint_examples')}
        >
          <div className="-ml-0.9 -mt-0.8 h-8 w-8 flex-shrink-0">
            <div className="relative flex">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-full p-1 dark:text-white">
                {tags.length > 0 ? (
                  <BookmarkFilledIcon className="h-6 w-6" />
                ) : (
                  <BookmarkIcon className="h-6 w-6" />
                )}
              </div>
            </div>
          </div>
          <div
            className="mt-2 grow overflow-hidden text-ellipsis whitespace-nowrap text-left text-black dark:text-gray-100"
            style={{ marginTop: '0', marginLeft: '0' }}
          >
            {tags.length > 0 ? tags.join(',') : localize('com_ui_bookmarks')}
          </div>
        </button>
      </Trigger>
      <Portal>
        <div className="fixed left-0 top-0 z-auto translate-x-[268px] translate-y-[50px]">
          <Content
            side="bottom"
            align="start"
            className="mt-2 max-h-96 min-w-[240px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-700 dark:text-white lg:max-h-96"
          >
            {data && conversation && data.some((tag) => tag.count > 0) && (
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
