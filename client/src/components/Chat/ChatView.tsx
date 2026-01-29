import { memo, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useForm } from 'react-hook-form';
import { Spinner, useMediaQuery } from '@librechat/client';
import { useParams, useOutletContext } from 'react-router-dom';
import { Constants, buildTree } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ChatFormValues, ContextType } from '~/common';
import { ChatContext, AddedChatContext, useFileMapContext, ChatFormProvider } from '~/Providers';
import { useChatHelpers, useAddedResponse, useSSE } from '~/hooks';
import ConversationStarters from './Input/ConversationStarters';
import { useGetMessagesByConvoId } from '~/data-provider';
import MessagesView from './Messages/MessagesView';
import Presentation from './Presentation';
import ChatForm from './Input/ChatForm';
import Landing from './Landing';
import Footer from './Footer';
import { cn } from '~/utils';
import store from '~/store';
import { ASSISTANT_DISPLAY_NAME } from '~/constants/branding';

function LoadingSpinner() {
  return (
    <div className="relative flex-1 overflow-hidden overflow-y-auto">
      <div className="relative flex h-full items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    </div>
  );
}

function ChatView({ index = 0 }: { index?: number }) {
  const { conversationId } = useParams();
  const { navVisible } = useOutletContext<ContextType>();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
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
  const isLandingPage =
    (!messagesTree || messagesTree.length === 0) &&
    (conversationId === Constants.NEW_CONVO || !conversationId);
  const isNavigating = (!messagesTree || messagesTree.length === 0) && conversationId != null;

  if (isLoading && conversationId !== Constants.NEW_CONVO) {
    content = <LoadingSpinner />;
  } else if ((isLoading || isNavigating) && !isLandingPage) {
    content = <LoadingSpinner />;
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
              <div className="hidden px-4 pb-3 pt-[max(env(safe-area-inset-top),16px)] text-lg font-semibold text-text-primary md:block">
                {ASSISTANT_DISPLAY_NAME}
              </div>
              <div className="hidden px-4 pb-2 text-sm text-text-secondary md:block">
                Answers are limited to the Ontario Building Code and include page-cited references.
              </div>
              <>
                <div
                  className={cn(
                    'flex flex-1 flex-col overflow-hidden',
                    isLandingPage
                      ? 'items-center justify-end sm:justify-center'
                      : 'min-h-0',
                  )}
                >
                  <div
                    className={cn(
                      'flex-1',
                      isLandingPage
                        ? 'pb-32 md:pb-0'
                        : 'min-h-0 overflow-y-auto pb-32 md:pb-0',
                    )}
                  >
                    {content}
                  </div>
                  {isLandingPage && <ConversationStarters />}
                </div>
                <div
                  className={cn(
                    'ios-dock fixed inset-x-0 bottom-0 z-40 w-full shrink-0 border-t border-border-light bg-surface-primary-alt/90 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 backdrop-blur-md dark:bg-gray-900/80 md:static md:z-auto',
                    isSmallScreen && navVisible && 'hidden',
                  )}
                >
                  <ChatForm index={index} />
                  {!isLandingPage && <Footer />}
                </div>
              </>
            </div>
          </Presentation>
        </AddedChatContext.Provider>
      </ChatContext.Provider>
    </ChatFormProvider>
  );
}

export default memo(ChatView);
