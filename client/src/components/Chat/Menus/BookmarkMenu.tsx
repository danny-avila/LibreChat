import { useEffect, useState, type FC } from 'react';
import { useRecoilValue } from 'recoil';
import { useLocation } from 'react-router-dom';
import { TConversation } from 'librechat-data-provider';
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
    thisConversation.conversationId !== 'new' &&
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
          conversationId: thisConversation.conversationId,
          tags: [SAVED_TAG],
        });
        setTags([SAVED_TAG]);
        setConversation({ ...thisConversation, tags: [SAVED_TAG] });
      }
    }
  };

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Trigger asChild>
        <button
          className={cn(
            'pointer-cursor relative flex flex-col rounded-md border border-gray-100 bg-white text-left focus:outline-none focus:ring-0 dark:border-gray-700 dark:bg-gray-800 sm:text-sm',
            'hover:bg-gray-50 radix-state-open:bg-gray-50 dark:hover:bg-gray-700 dark:radix-state-open:bg-gray-700',
            'z-50 flex h-[40px] min-w-4 flex-none items-center justify-center px-3 focus:outline-offset-2 focus:ring-0 focus-visible:ring-2 focus-visible:ring-gray-500',
          )}
          title={localize('com_ui_bookmarks')}
        >
          {isLoading ? (
            <Spinner />
          ) : tags && tags.length > 0 ? (
            <BookmarkFilledIcon className="icon-sm" />
          ) : (
            <BookmarkIcon className="icon-sm" />
          )}
        </button>
      </Trigger>
      <Portal>
        <Content
          className={cn(
            'grid w-full',
            'mt-2 min-w-[240px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-700 dark:text-white',
            'max-h-[500px]',
          )}
          side="bottom"
          align="start"
        >
          {data && conversation && (
            // Display all bookmarks registered by the user and highlight the tags of the currently selected conversation
            <BookmarkContext.Provider value={{ bookmarks: data }}>
              <BookmarkMenuItems
                // Currently selected conversation
                conversation={conversation}
                setConversation={setConversation}
                // Tags in the conversation
                tags={tags ?? []}
                // Update tags in the conversation
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
