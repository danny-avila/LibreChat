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

  const [showCostBar, setShowCostBar] = useState(true);
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

  const { data: conversationCosts } = useGetConversationCosts(conversationId ?? '', {
    enabled: !!conversationId && conversationId !== Constants.NEW_CONVO,
  });

  const chatHelpers = useChatHelpers(index, conversationId);
  const addedChatHelpers = useAddedResponse({ rootIndex: index });

  useSSE(rootSubmission, chatHelpers, false);
  useSSE(addedSubmission, addedChatHelpers, true);

  useEffect(() => {
    const handleScroll = (event: Event) => {
      const target = event.target as HTMLElement;
      const currentScrollY = target.scrollTop;
      const scrollHeight = target.scrollHeight;
      const clientHeight = target.clientHeight;

      const distanceFromBottom = scrollHeight - currentScrollY - clientHeight;
      const isAtBottom = distanceFromBottom < 10;

      setShowCostBar(isAtBottom);
      lastScrollY.current = currentScrollY;
    };

    const findAndAttachScrollListener = () => {
      const messagesContainer = document.querySelector('[class*="scrollbar-gutter-stable"]');
      if (messagesContainer) {
        messagesContainer.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
          messagesContainer.removeEventListener('scroll', handleScroll);
        };
      }
      setTimeout(findAndAttachScrollListener, 100);
    };

    const cleanup = findAndAttachScrollListener();

    return cleanup;
  }, [messagesTree]);

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
    content = (
      <MessagesView
        messagesTree={messagesTree}
        costBar={
          !isLandingPage &&
          conversationCosts &&
          conversationCosts.totals && (
            <div
              className={cn(
                'mx-auto w-full max-w-md px-4 text-xs text-muted-foreground transition-all duration-300 ease-in-out',
                showCostBar ? 'opacity-100' : 'opacity-0',
              )}
            >
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="1em"
                      height="1em"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      className="inline"
                    >
                      <path
                        fillRule="evenodd"
                        d="M11.293 5.293a1 1 0 0 1 1.414 0l5 5a1 1 0 0 1-1.414 1.414L13 8.414V18a1 1 0 1 1-2 0V8.414l-3.293 3.293a1 1 0 0 1-1.414-1.414l5-5Z"
                        clipRule="evenodd"
                      ></path>
                    </svg>
                    {conversationCosts.totals.prompt.tokenCount}t
                  </div>
                  <div>${Math.abs(conversationCosts.totals.prompt.usd).toFixed(6)}</div>
                </div>
                <div>
                  <div>{conversationCosts.totals.total.tokenCount}t</div>
                  <div>${Math.abs(conversationCosts.totals.total.usd).toFixed(6)}</div>
                </div>
                <div>
                  <div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="1em"
                      height="1em"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      className="inline"
                    >
                      <path
                        fillRule="evenodd"
                        d="M12.707 18.707a1 1 0 0 1-1.414 0l-5-5a1 1 0 1 1 1.414-1.414L11 15.586V6a1 1 0 1 1 2 0v9.586l3.293-3.293a1 1 0 0 1 1.414 1.414l-5 5Z"
                        clipRule="evenodd"
                      ></path>
                    </svg>
                    {conversationCosts.totals.completion.tokenCount}t
                  </div>
                  <div>${Math.abs(conversationCosts.totals.completion.usd).toFixed(6)}</div>
                </div>
              </div>
            </div>
          )
        }
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
