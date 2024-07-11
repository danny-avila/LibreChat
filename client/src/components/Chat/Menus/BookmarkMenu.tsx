import { useEffect, useState, type FC } from 'react';
import { useLocation } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import { TConversation } from 'librechat-data-provider';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';
import { BookmarkFilledIcon, BookmarkIcon } from '@radix-ui/react-icons';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

import { useConversationTagsQuery, useTagConversationMutation } from '~/data-provider';
import { Spinner } from '~/components';
import { BookmarkMenuItems } from './Bookmarks/BookmarkMenuItems';
import { BookmarkContext } from '~/Providers/BookmarkContext';

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

  const { mutateAsync, isLoading, isError } = useTagConversationMutation(
    thisConversation?.conversationId ?? '',
  );

  const { data, refetch } = useConversationTagsQuery();
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
          tags: ['saved'],
        });
        setTags(['saved']);
        setConversation({ ...thisConversation, tags: ['saved'] });
      }
      setIsOpen(true);
    }
  };

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Trigger asChild>
        <button
          className={cn(
            'pointer-cursor relative flex flex-col rounded-md border border-gray-100 bg-white text-left focus:outline-none focus:ring-0 focus:ring-offset-0 dark:border-gray-700 dark:bg-gray-800 sm:text-sm',
            'hover:bg-gray-50 radix-state-open:bg-gray-50 dark:hover:bg-gray-700 dark:radix-state-open:bg-gray-700',
            'z-50 flex h-[40px] min-w-4 flex-none items-center justify-center px-3 focus:ring-0 focus:ring-offset-0',
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
            // ユーザーが登録しているすべてのブックマークを表示し、現在選択されている会話のタグをハイライトする
            <BookmarkContext.Provider value={{ bookmarks: data }}>
              <BookmarkMenuItems
                // 現在選択されている会話
                conversation={conversation}
                setConversation={setConversation}
                // 会話に含まれているタグ
                tags={tags ?? []}
                // 会話に含まれているタグを更新
                setTags={setTags}
                refetch={refetch}
              />
            </BookmarkContext.Provider>
          )}
        </Content>
      </Portal>
    </Root>
  );
};

export default BookmarkMenu;
