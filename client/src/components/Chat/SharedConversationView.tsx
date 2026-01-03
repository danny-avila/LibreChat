import { memo, useCallback, useMemo } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useForm } from 'react-hook-form';
import { useParams, useSearchParams } from 'react-router-dom';
import { Spinner, TooltipAnchor, Button, useToastContext } from '@librechat/client';
import { GitFork, Copy, Share2 } from 'lucide-react';
import { Constants, buildTree } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import {
  useGetSharedConversationQuery,
  useGetSharedConversationMessagesQuery,
  useForkSharedConversationMutation,
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

function SharedConversationBanner({
  ownerName,
  onFork,
  isForking,
}: {
  ownerName?: string;
  onFork: () => void;
  isForking: boolean;
}) {
  const localize = useLocalize();

  return (
    <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary px-4 py-2">
      <div className="flex items-center gap-2">
        <Share2 className="size-4 text-green-500" />
        <span className="text-sm text-text-primary">
          {localize('com_ui_shared_conversation')}
          {ownerName && (
            <span className="text-text-secondary">
              {' '}
              - {localize('com_ui_shared_by', { name: ownerName })}
            </span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <TooltipAnchor
          description={localize('com_ui_fork_conversation')}
          render={(props) => (
            <Button
              {...props}
              size="sm"
              variant="outline"
              onClick={onFork}
              disabled={isForking}
              className="gap-1"
            >
              {isForking ? (
                <Spinner className="size-4" />
              ) : (
                <GitFork className="size-4" />
              )}
              {localize('com_ui_fork_conversation')}
            </Button>
          )}
        />
      </div>
    </div>
  );
}

function ReadOnlyInputBar() {
  const localize = useLocalize();

  return (
    <div className="w-full border-t border-border-light bg-surface-secondary px-4 py-3">
      <div className="flex items-center justify-center gap-2 text-sm text-text-secondary">
        <Share2 className="size-4" />
        <span>{localize('com_ui_read_only_shared')}</span>
      </div>
    </div>
  );
}

function SharedConversationView({ index = 0 }: { index?: number }) {
  const { conversationId } = useParams();
  const [searchParams] = useSearchParams();
  const localize = useLocalize();
  const { showToast } = useToastContext();
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

  const { mutateAsync: forkConversation, isLoading: isForking } = useForkSharedConversationMutation();

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

  const handleFork = useCallback(async () => {
    if (!conversationId) {
      return;
    }

    try {
      const result = await forkConversation({ conversationId });
      showToast({
        message: localize('com_ui_fork_shared_success'),
        severity: 'success',
      });
      // Navigate to the new conversation
      if (result.conversation?.conversationId) {
        window.location.href = `/c/${result.conversation.conversationId}`;
      }
    } catch (error) {
      showToast({
        message: localize('com_ui_share_error'),
        severity: 'error',
      });
    }
  }, [conversationId, forkConversation, localize, showToast]);

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
                <SharedConversationBanner
                  ownerName={sharedConvo?.user as string | undefined}
                  onFork={handleFork}
                  isForking={isForking}
                />
                {!isLoading && <Header />}
                <div className={cn('flex h-full flex-col overflow-y-auto')}>
                  {content}
                </div>
                <ReadOnlyInputBar />
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
