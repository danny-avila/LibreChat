import { memo, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useForm } from 'react-hook-form';
import { Spinner } from '@librechat/client';
import { useParams } from 'react-router-dom';
import { Folder } from 'lucide-react';
import { Constants, buildTree } from 'librechat-data-provider';
import type { TChatProject, TMessage } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import { ChatContext, AddedChatContext, ChatFormProvider, useFileMapContext } from '~/Providers';
import {
  useAddedResponse,
  useResumeOnLoad,
  useAdaptiveSSE,
  useChatHelpers,
  useLocalize,
} from '~/hooks';
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

function ProjectLanding({ project }: { project: TChatProject }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-6 z-10 w-full max-w-3xl -translate-x-1/2 px-4 transition-all duration-200 xl:max-w-4xl">
      <div className="max-w-full text-left">
        <div className="inline-flex max-w-full items-center gap-2 px-1 py-1 text-text-primary">
          <Folder className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
          <span className="min-w-0 truncate text-base font-medium sm:text-lg">{project.name}</span>
        </div>
        {project.description && (
          <p className="ml-8 mt-1 max-w-lg truncate text-xs text-text-secondary sm:text-sm">
            {project.description}
          </p>
        )}
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

  const methods = useForm<ChatFormValues>({
    defaultValues: { text: '' },
  });

  const fileMap = useFileMapContext();

  const { data: messagesTree = null, isLoading } = useGetMessagesByConvoId(
    conversationId ?? '',
    {
      select: useCallback(
        (data: TMessage[]) => {
          const dataTree = buildTree({ messages: data, fileMap });
          return dataTree?.length === 0 ? null : (dataTree ?? null);
        },
        [fileMap],
      ),
      enabled: !!fileMap,
    },
    { isStreaming: isSubmitting },
  );

  const chatHelpers = useChatHelpers(index, conversationId);
  const addedChatHelpers = useAddedResponse();

  useAdaptiveSSE(rootSubmission, chatHelpers, false, index);

  // Auto-resume if navigating back to conversation with active job
  // Wait for messages to load before resuming to avoid race condition
  useResumeOnLoad(conversationId, chatHelpers.getMessages, index, !isLoading);

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
  } else if (isProjectLandingPage && project) {
    content = <ProjectLanding project={project} />;
  } else {
    content = <Landing centerFormOnLanding={centerFormOnLanding} />;
  }

  const chatFormPlaceholder =
    isProjectLandingPage && project
      ? localize('com_ui_new_chat_in_project', { name: project.name })
      : undefined;

  return (
    <ChatFormProvider {...methods}>
      <ChatContext.Provider value={chatHelpers}>
        <AddedChatContext.Provider value={addedChatHelpers}>
          <Presentation>
            <div className="relative flex h-full w-full flex-col">
              <Header />
              <>
                <div
                  className={cn(
                    'relative flex flex-col',
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
                    <ChatForm index={index} placeholder={chatFormPlaceholder} />
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
