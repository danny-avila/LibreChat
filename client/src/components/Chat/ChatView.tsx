import type { TMessage } from 'librechat-data-provider';
import { useGetMessagesByConvoId } from 'librechat-data-provider/react-query';
import { memo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import type { ChatFormValues } from '~/common';
import { Spinner } from '~/components/svg';
import { useAddedResponse, useChatHelpers, useSSE } from '~/hooks';
import { AddedChatContext, ChatContext, ChatFormProvider, useFileMapContext } from '~/Providers';
import store from '~/store';
import { buildTree } from '~/utils';
import Header from './Header';
import ChatForm from './Input/ChatForm';
import ConversationStarters from './Input/ConversationStarters';
import Landing from './Landing';
import MessagesView from './Messages/MessagesView';
import Presentation from './Presentation';

function ChatView({ index = 0 }: { index?: number }) {
  const { conversationId } = useParams();
  const rootSubmission = useRecoilValue(store.submissionByIndex(index));
  const addedSubmission = useRecoilValue(store.submissionByIndex(index + 1));
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);

  const fileMap = useFileMapContext();

  const { data: messagesTree = null, isLoading } = useGetMessagesByConvoId(conversationId ?? '', {
    select: useCallback(
      (data: TMessage[]) => {
        const dataTree = buildTree({ messages: data, fileMap });
        return dataTree?.length === 0 ? null : (dataTree ?? null);
      },
      [fileMap],
    ),
    enabled: !!fileMap,
  });

  const chatHelpers = useChatHelpers(index, conversationId);
  const addedChatHelpers = useAddedResponse({ rootIndex: index });

  useSSE(rootSubmission, chatHelpers, false);
  useSSE(addedSubmission, addedChatHelpers, true);

  const methods = useForm<ChatFormValues>({
    defaultValues: { text: '' },
  });

  let content: JSX.Element | null | undefined;
  const isLandingPage = !messagesTree || messagesTree.length === 0;

  if (isLoading && conversationId !== 'new') {
    content = (
      <div className="relative flex-1 overflow-hidden overflow-y-auto">
        <div className="relative flex h-full items-center justify-center">
          <Spinner className="text-text-primary" />
        </div>
      </div>
    );
  } else if (!isLandingPage) {
    content = <MessagesView messagesTree={messagesTree} />;
  } else {
    content = <Landing centerFormOnLanding={centerFormOnLanding} />;
  }

  return (
    <ChatFormProvider {...methods}>
      <ChatContext.Provider value={chatHelpers}>
        <AddedChatContext.Provider value={addedChatHelpers}>
          <Presentation>
            <div className="flex h-full w-full flex-col">
              {!isLoading && <Header />}

              {isLandingPage ? (
                <>
                  <div className="flex flex-1 flex-col items-center justify-end sm:justify-center">
                    {content}
                    <div className="w-full max-w-3xl transition-all duration-200 xl:max-w-4xl">
                      <ChatForm index={index} />
                      <ConversationStarters />
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col overflow-y-auto">
                  {content}
                  <div className="w-full">
                    <ChatForm index={index} />
                  </div>
                </div>
              )}
            </div>
          </Presentation>
        </AddedChatContext.Provider>
      </ChatContext.Provider>
    </ChatFormProvider>
  );
}

export default memo(ChatView);
