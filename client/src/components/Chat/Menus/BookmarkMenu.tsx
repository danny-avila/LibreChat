import { useState, type FC } from 'react';
import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';
import { BookmarkFilledIcon, BookmarkIcon } from '@radix-ui/react-icons';
import { useConversationTagsQuery, useTagConversationMutation } from '~/data-provider';
import { BookmarkMenuItems } from './Bookmarks/BookmarkMenuItems';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import { useLocalize, useBookmarkSuccess } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { Button } from '~/components/ui';
import { Spinner } from '~/components';
import store from '~/store';

const BookmarkMenu: FC = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();

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
    if (tags.length > 0) {
      setIsOpen(open);
      return;
    }

    if (!conversationId) {
      showToast({
        message: localize('com_ui_no_conversation_id'),
        severity: NotificationSeverity.ERROR,
      });
    }

    await mutateAsync(
      {
        tags: [Constants.SAVED_TAG as string],
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
  };

  const renderButtonContent = () => {
    if (isLoading) {
      return <Spinner />;
    }
    if (tags.length > 0) {
      return <BookmarkFilledIcon className="icon-sm" />;
    }
    return <BookmarkIcon className="icon-sm" />;
  };

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Trigger asChild>
        <Button
          id="header-bookmarks-menu"
          variant="outline"
          className="h-10 w-10 p-0 transition-all duration-300 ease-in-out"
          title={localize('com_ui_bookmarks')}
        >
          {renderButtonContent()}
        </Button>
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
