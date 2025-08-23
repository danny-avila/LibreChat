import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { useForm } from 'react-hook-form';
import { Spinner } from '@librechat/client';
import { useParams } from 'react-router-dom';
import { Constants, buildTree } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import { ChatContext, AddedChatContext, useFileMapContext, ChatFormProvider } from '~/Providers';
import { useGetMessagesByConvoId, useGetConversationCosts } from '~/data-provider';
import { useChatHelpers, useAddedResponse, useSSE } from '~/hooks';
import ConversationStarters from './Input/ConversationStarters';
import MessagesView from './Messages/MessagesView';
import Presentation from './Presentation';
import ChatForm from './Input/ChatForm';
import CostBar from './CostBar';
import Landing from './Landing';
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

function ChatView({ index = 0 }: { index?: number }) {
  const { conversationId } = useParams();
  const rootSubmission = useRecoilValue(store.submissionByIndex(index));
  const addedSubmission = useRecoilValue(store.submissionByIndex(index + 1));
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);

  const fileMap = useFileMapContext();

  const [showCostBar, setShowCostBar] = useState(false);
  const lastScrollY = useRef(0);

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

  const { data: conversationCosts } = useGetConversationCosts(
    conversationId && conversationId !== Constants.NEW_CONVO ? conversationId : '',
    {
      enabled: !!conversationId && conversationId !== Constants.NEW_CONVO && conversationId !== '',
    },
  );

  const chatHelpers = useChatHelpers(index, conversationId);
  const addedChatHelpers = useAddedResponse({ rootIndex: index });

  useSSE(rootSubmission, chatHelpers, false);
  useSSE(addedSubmission, addedChatHelpers, true);

  const checkIfAtBottom = useCallback(
    (container: HTMLElement) => {
      const currentScrollY = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;

      const distanceFromBottom = scrollHeight - currentScrollY - clientHeight;
      const isAtBottom = distanceFromBottom < 10;

      const isStreaming = chatHelpers.isSubmitting || addedChatHelpers.isSubmitting;
      setShowCostBar(isAtBottom && !isStreaming);
      lastScrollY.current = currentScrollY;
    },
    [chatHelpers.isSubmitting, addedChatHelpers.isSubmitting],
  );

  useEffect(() => {
    const handleScroll = (event: Event) => {
      const target = event.target as HTMLElement;
      checkIfAtBottom(target);
    };

    const findAndAttachScrollListener = () => {
      const messagesContainer = document.querySelector('[class*="scrollbar-gutter-stable"]');
      if (messagesContainer) {
        checkIfAtBottom(messagesContainer as HTMLElement);

        messagesContainer.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
          messagesContainer.removeEventListener('scroll', handleScroll);
        };
      }
      setTimeout(findAndAttachScrollListener, 100);
    };

    const cleanup = findAndAttachScrollListener();

    return cleanup;
  }, [messagesTree, checkIfAtBottom]);

  useEffect(() => {
    const isStreaming = chatHelpers.isSubmitting || addedChatHelpers.isSubmitting;
    if (isStreaming) {
      setShowCostBar(false);
    } else {
      const messagesContainer = document.querySelector('[class*="scrollbar-gutter-stable"]');
      if (messagesContainer) {
        checkIfAtBottom(messagesContainer as HTMLElement);
      }
    }
  }, [chatHelpers.isSubmitting, addedChatHelpers.isSubmitting, checkIfAtBottom]);

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
    const isStreaming = chatHelpers.isSubmitting || addedChatHelpers.isSubmitting;
    content = (
      <MessagesView
        messagesTree={messagesTree}
        costBar={
          !isLandingPage &&
          conversationCosts &&
          conversationCosts.totals && (
            <CostBar
              conversationCosts={conversationCosts}
              showCostBar={showCostBar && !isStreaming}
            />
          )
        }
        costs={conversationCosts}
      />
    );
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
              <>
                <div
                  className={cn(
                    'flex flex-col',
                    isLandingPage
                      ? 'flex-1 items-center justify-end sm:justify-center'
                      : 'h-full overflow-y-auto',
                  )}
                >
                  {content}
                  <div
                    className={cn(
                      'w-full',
                      isLandingPage && 'max-w-3xl transition-all duration-200 xl:max-w-4xl',
                    )}
                  >
                    <ChatForm index={index} />
                    {isLandingPage ? <ConversationStarters /> : <Footer />}
                  </div>
                </div>
                {isLandingPage && <Footer />}
              </>
            </div>
          </Presentation>
        </AddedChatContext.Provider>
      </ChatContext.Provider>
    </ChatFormProvider>
  );
}

export default memo(ChatView);
