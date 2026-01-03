import { memo, useMemo, useEffect } from 'react';
import { useSetRecoilState } from 'recoil';
import { useForm } from 'react-hook-form';
import { useParams, useSearchParams } from 'react-router-dom';
import { Spinner } from '@librechat/client';
import { buildTree } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import {
  useGetSharedConversationQuery,
  useGetSharedConversationMessagesQuery,
} from 'librechat-data-provider/react-query';
import {
  ChatContext,
  AddedChatContext,
  useFileMapContext,
  ChatFormProvider,
  ShareContext,
} from '~/Providers';
import {
  useAddedResponse,
  useChatHelpers,
  useLocalize,
} from '~/hooks';
import MessagesView from './Messages/MessagesView';
import Presentation from './Presentation';
import Header from './Header';
import Footer from './Footer';
import { cn } from '~/utils';
import store from '~/store';

function LoadingSpinner() {
  return (
    <div className="relative flex-1 overflow-hidden overflow-y-auto">
      <div className="relative flex h-full items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    </div>
  );
}

function SharedConversationView({ index = 0 }: { index?: number }) {
  const { conversationId } = useParams();
  const [searchParams] = useSearchParams();
  const localize = useLocalize();
  const setConversation = useSetRecoilState(store.conversationByIndex(index));

  const isSharedView = searchParams.get('shared') === 'true';
  const fileMap = useFileMapContext();

  // Fetch shared conversation data
  const { data: sharedConvo, isLoading: isLoadingConvo } = useGetSharedConversationQuery(
    conversationId ?? '',
    {
      enabled: !!conversationId && isSharedView,
    },
  );

  // Fetch messages for shared conversation
  const { data: messages = [], isLoading: isLoadingMessages } = useGetSharedConversationMessagesQuery(
    conversationId ?? '',
    {
      enabled: !!conversationId && isSharedView,
    },
  );

  // Set the shared conversation to Recoil state so HoverButtons can access it
  useEffect(() => {
    if (sharedConvo && !isLoadingConvo) {
      setConversation(sharedConvo as TConversation);
    }
  }, [sharedConvo, isLoadingConvo, setConversation]);

  const messagesTree = useMemo(() => {
    if (!messages || messages.length === 0) {
      return null;
    }
    const tree = buildTree({ messages, fileMap });
    return tree?.length === 0 ? null : (tree ?? null);
  }, [messages, fileMap]);

  const chatHelpers = useChatHelpers(index, conversationId);
  const addedChatHelpers = useAddedResponse();

  const methods = useForm<ChatFormValues>({
    defaultValues: { text: '' },
  });

  const shareContextValue = useMemo(
    () => ({
      isSharedWithUser: true,
      sharedByUserId: sharedConvo?.sharedByUserId,
      sharedByUserName: sharedConvo?.user,
    }),
    [sharedConvo],
  );

  const isLoading = isLoadingConvo || isLoadingMessages;

  let content: JSX.Element | null | undefined;

  if (isLoading) {
    content = <LoadingSpinner />;
  } else if (messagesTree) {
    content = <MessagesView messagesTree={messagesTree} />;
  } else {
    content = (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-secondary">{localize('com_ui_no_messages')}</p>
      </div>
    );
  }

  return (
    <ChatFormProvider {...methods}>
      <ShareContext.Provider value={shareContextValue}>
        <ChatContext.Provider value={chatHelpers}>
          <AddedChatContext.Provider value={addedChatHelpers}>
            <Presentation>
              <div className="relative flex h-full w-full flex-col">
                {!isLoading && <Header />}
                <div className={cn('flex h-full flex-col overflow-y-auto')}>
                  {content}
                </div>
                <Footer />
              </div>
            </Presentation>
          </AddedChatContext.Provider>
        </ChatContext.Provider>
      </ShareContext.Provider>
    </ChatFormProvider>
  );
}

export default memo(SharedConversationView);
