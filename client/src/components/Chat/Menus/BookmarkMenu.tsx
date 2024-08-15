import { useState, type FC } from 'react';
import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';
import { BookmarkFilledIcon, BookmarkIcon } from '@radix-ui/react-icons';
import { useConversationTagsQuery, useTagConversationMutation } from '~/data-provider';
import { BookmarkMenuItems } from './Bookmarks/BookmarkMenuItems';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import { useLocalize, useBookmarkSuccess } from '~/hooks';
import { Spinner } from '~/components';
import { cn } from '~/utils';
import store from '~/store';

const BookmarkMenu: FC = () => {
  const localize = useLocalize();

  const conversation = useRecoilValue(store.conversationByIndex(0));
  const conversationId = conversation?.conversationId ?? '';
  const onSuccess = useBookmarkSuccess(conversationId);
  const [tags, setTags] = useState<string[]>(conversation?.tags || []);

  const [open, setIsOpen] = useState(false);

  const { mutateAsync, isLoading } = useTagConversationMutation(conversationId);

  const { data } = useConversationTagsQuery();

  const isActiveConvo =
    conversation &&
    conversationId &&
    conversationId !== Constants.NEW_CONVO &&
    conversationId !== 'search';

  if (!isActiveConvo) {
    return <></>;
  }

  const onOpenChange = async (open: boolean) => {
    if (!open) {
      setIsOpen(open);
      return;
    }
    if (open && tags && tags.length > 0) {
      setIsOpen(open);
    } else {
      if (conversation && conversationId) {
        await mutateAsync(
          {
            tags: [Constants.SAVED_TAG as 'Saved'],
          },
          {
            onSuccess: (newTags: string[]) => {
              setTags(newTags);
              onSuccess(newTags);
            },
            onError: () => {
              console.error('Error adding bookmark');
            },
          },
        );
      }
    }
  };

  const renderButtonContent = () => {
    if (isLoading) {
      return <Spinner />;
    }
    if (tags && tags.length > 0) {
      return <BookmarkFilledIcon className="icon-sm" />;
    }
    return <BookmarkIcon className="icon-sm" />;
  };

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Trigger asChild>
        <button
          id="header-bookmarks-menu"
          className={cn(
            'pointer-cursor relative flex flex-col rounded-md border border-border-light bg-transparent text-left focus:outline-none focus:ring-0 sm:text-sm',
            'hover:bg-header-button-hover radix-state-open:bg-header-button-hover',
            'z-50 flex h-[40px] min-w-4 flex-none items-center justify-center px-3 focus:outline-offset-2 focus:ring-0 focus-visible:ring-2 focus-visible:ring-ring-primary ',
          )}
          title={localize('com_ui_bookmarks')}
        >
          {renderButtonContent()}
        </button>
      </Trigger>
      <Portal>
        <Content
          className="mt-2 grid max-h-[500px] w-full min-w-[240px] overflow-y-auto rounded-lg border border-border-medium bg-header-primary text-text-primary shadow-lg"
          side="bottom"
          align="start"
        >
          {data && conversation && (
            <BookmarkContext.Provider value={{ bookmarks: data }}>
              <BookmarkMenuItems conversation={conversation} tags={tags ?? []} setTags={setTags} />
            </BookmarkContext.Provider>
          )}
        </Content>
      </Portal>
    </Root>
  );
};

export default BookmarkMenu;
