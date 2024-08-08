import { useEffect, useState, type FC } from 'react';
import { useRecoilValue } from 'recoil';
import { useLocation } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';
import { BookmarkFilledIcon, BookmarkIcon } from '@radix-ui/react-icons';
import { useConversationTagsQuery, useTagConversationMutation } from '~/data-provider';
import { BookmarkMenuItems } from './Bookmarks/BookmarkMenuItems';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import { Spinner } from '~/components';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const SAVED_TAG = 'Saved';
const BookmarkMenu: FC = () => {
  const localize = useLocalize();
  const location = useLocation();

  const activeConvo = useRecoilValue(store.conversationByIndex(0));

  const globalConvo = useRecoilValue(store.conversation) ?? ({} as TConversation);
  const [tags, setTags] = useState<string[]>();

  const [open, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState<TConversation>();

  let thisConversation: TConversation | null | undefined;
  if (location.state?.from?.pathname.includes('/chat')) {
    thisConversation = globalConvo;
  } else {
    thisConversation = activeConvo;
  }

  const { mutateAsync, isLoading } = useTagConversationMutation(
    thisConversation?.conversationId ?? '',
  );

  const { data } = useConversationTagsQuery();
  useEffect(() => {
    if (
      (!conversation && thisConversation) ||
      (conversation &&
        thisConversation &&
        conversation.conversationId !== thisConversation.conversationId)
    ) {
      setConversation(thisConversation);
      setTags(thisConversation.tags ?? []);
    }
    if (tags === undefined && conversation) {
      setTags(conversation.tags ?? []);
    }
  }, [thisConversation, conversation, tags]);

  const isActiveConvo =
    thisConversation &&
    thisConversation.conversationId &&
    thisConversation.conversationId !== Constants.NEW_CONVO &&
    thisConversation.conversationId !== 'search';

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
      if (thisConversation && thisConversation.conversationId) {
        await mutateAsync({
          tags: [SAVED_TAG],
        });
        setTags([SAVED_TAG]);
        setConversation({ ...thisConversation, tags: [SAVED_TAG] });
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
          className={cn(
            'pointer-cursor relative flex flex-col rounded-md border border-border-medium bg-surface-primary text-left focus:outline-none focus:ring-0 sm:text-sm',
            'radix-state-open:bg-bg-surface-tertiary hover:bg-surface-tertiary',
            'z-50 flex h-[40px] min-w-4 flex-none items-center justify-center px-3 focus:outline-offset-2 focus:ring-0 focus-visible:ring-2 focus-visible:ring-ring-primary ',
          )}
          title={localize('com_ui_bookmarks')}
        >
          {renderButtonContent()}
        </button>
      </Trigger>
      <Portal>
        <Content
          className="mt-2 grid max-h-[500px] w-full min-w-[240px] overflow-y-auto rounded-lg border border-border-medium bg-surface-tertiary-alt shadow-lg"
          side="bottom"
          align="start"
        >
          {data && conversation && (
            <BookmarkContext.Provider value={{ bookmarks: data }}>
              <BookmarkMenuItems
                conversation={conversation}
                setConversation={setConversation}
                tags={tags ?? []}
                setTags={setTags}
              />
            </BookmarkContext.Provider>
          )}
        </Content>
      </Portal>
    </Root>
  );
};

export default BookmarkMenu;
