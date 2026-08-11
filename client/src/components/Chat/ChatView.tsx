import { memo, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useForm } from 'react-hook-form';
import { Spinner } from '@librechat/client';
import { useParams } from 'react-router-dom';
import { Constants, buildTree } from 'librechat-data-provider';
import type { TChatProject, TMessage } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import {
  useAddedResponse,
  useResumeOnLoad,
  useAdaptiveSSE,
  useChatHelpers,
  useQueueDrain,
  useLocalize,
} from '~/hooks';
import { ChatContext, AddedChatContext, ChatFormProvider, useFileMapContext } from '~/Providers';
import ConversationStarters from './Input/ConversationStarters';
import { useGetMessagesByConvoId } from '~/data-provider';
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

function ChatView({ index = 0, project }: { index?: number; project?: TChatProject }) {
  const { conversationId } = useParams();
  const localize = useLocalize();
  const rootSubmission = useRecoilValue(store.submissionByIndex(index));
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);
  /** Room an open composer popover needs below the composer; see the atom. */
  const composerLift = useRecoilValue(store.composerLiftFamily(index));

  const methods = useForm<ChatFormValues>({
    defaultValues: { text: '' },
  });

  const fileMap = useFileMapContext();

  const {
    data: messagesTree = null,
    isLoading,
    isFetching,
  } = useGetMessagesByConvoId(
    conversationId ?? '',
    {
      select: useCallback(
        (data: TMessage[]) => {
          const dataTree = buildTree({ messages: data, fileMap });
          return dataTree?.length === 0 ? null : (dataTree ?? null);
        },
        [fileMap],
      ),
      enabled: !!conversationId && conversationId !== Constants.SEARCH,
      /** Refetch stale caches on mount: navigation invalidates (not removes)
       * messages now, so a warm conversation renders instantly from cache and
       * reconciles in the background instead of unmounting into a spinner. */
      refetchOnMount: true,
    },
    { isStreaming: isSubmitting },
  );

  const chatHelpers = useChatHelpers(index, conversationId);
  const addedChatHelpers = useAddedResponse();

  const activeConversation =
    chatHelpers.conversation?.conversationId === conversationId
      ? chatHelpers.conversation
      : undefined;
  const activeSubagentThread = activeConversation?.subagentThread;

  useAdaptiveSSE(rootSubmission, chatHelpers, false, index);

  // Auto-resume if navigating back to conversation with active job.
  // Wait for messages to load AND the warm-cache background revalidation to
  // settle: a stale invalidated cache mounts with isLoading false while the
  // refetch is in flight, and resume must not build from (or race) it.
  useResumeOnLoad(conversationId, chatHelpers.getMessages, index, !isLoading && !isFetching);

  // Auto-send queued follow-up messages once a run finishes cleanly.
  useQueueDrain(index, conversationId, chatHelpers.ask);

  let content: JSX.Element | null | undefined;
  const isLandingPage =
    (!messagesTree || messagesTree.length === 0) &&
    (conversationId === Constants.NEW_CONVO || !conversationId);
  const isNavigating = (!messagesTree || messagesTree.length === 0) && conversationId != null;
  const isProjectLandingPage = isLandingPage && project != null;

  if (isLoading && conversationId !== Constants.NEW_CONVO) {
    content = <LoadingSpinner />;
  } else if ((isLoading || isNavigating) && !isLandingPage) {
    content = <LoadingSpinner />;
  } else if (!isLandingPage) {
    content = <MessagesView messagesTree={messagesTree} />;
  } else {
    content = <Landing centerFormOnLanding={centerFormOnLanding} />;
  }

  const chatFormPlaceholder =
    isProjectLandingPage && project
      ? localize('com_ui_new_chat_in_project', { name: project.name })
      : undefined;

  // Recoil conversation can lag the route during navigation; only announce a
  // title that belongs to the conversation currently in the URL.
  const conversationTitle =
    chatHelpers.conversation?.conversationId === conversationId
      ? chatHelpers.conversation?.title?.trim()
      : undefined;
  const pageHeading =
    isLandingPage || !conversationTitle ? localize('com_ui_new_chat') : conversationTitle;
  const parentConversationId = activeSubagentThread?.parentConversationId;
  /** Durable child threads are an execution record owned by their parent agent.
   * Human continuation is a separate future fork/promotion flow, never an
   * in-place mutation of this canonical child transcript. */
  const isSubagentThreadReadOnly = activeSubagentThread != null;

  return (
    <ChatFormProvider {...methods}>
      <ChatContext.Provider value={chatHelpers}>
        <AddedChatContext.Provider value={addedChatHelpers}>
          <Presentation>
            <div data-chat-pane={index} className="relative flex h-full w-full flex-col">
              <h1 className="sr-only">{pageHeading}</h1>
              <Header
                parentConversationId={parentConversationId}
                readOnly={isSubagentThreadReadOnly}
              />
              <>
                <div
                  /* Greeting and composer rise together to clear an open
                     composer popover, rather than the page growing a scrollbar
                     under one. Applied here rather than to the composer's own
                     wrapper so the greeting travels with it instead of being
                     slid underneath. Off the landing screen the composer already
                     sits at the foot of a scrolling thread, which has room of
                     its own. */
                  style={
                    isLandingPage && composerLift > 0
                      ? { transform: `translateY(-${composerLift}px)` }
                      : undefined
                  }
                  className={cn(
                    'flex flex-col',
                    isLandingPage
                      ? 'flex-1 items-center justify-end transition-transform duration-200 ease-out motion-reduce:transition-none sm:justify-center'
                      : 'h-full overflow-y-auto',
                  )}
                >
                  {content}
                  <div
                    className={cn(
                      'w-full',
                      !isLandingPage && 'scrollbar-gutter-spacer',
                      isLandingPage &&
                        'max-w-3xl transition-all duration-200 ease-out xl:max-w-4xl',
                    )}
                  >
                    {isLandingPage && <ConversationStarters />}
                    {isSubagentThreadReadOnly ? (
                      <div
                        className="mx-auto w-full max-w-3xl px-4 py-3 text-center text-sm text-text-secondary xl:max-w-4xl"
                        role="note"
                      >
                        {localize('com_ui_subagent_thread_read_only')}
                      </div>
                    ) : (
                      <ChatForm
                        index={index}
                        placeholder={chatFormPlaceholder}
                        project={isProjectLandingPage ? project : undefined}
                      />
                    )}
                    {!isLandingPage && <Footer />}
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
