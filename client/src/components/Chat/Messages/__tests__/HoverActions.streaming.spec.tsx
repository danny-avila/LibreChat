import React, { useMemo } from 'react';
import { RecoilRoot, type MutableSnapshot } from 'recoil';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, type TConversation, type TMessage } from 'librechat-data-provider';
import { ChatContext, MessagesViewProvider, useChatContext } from '~/Providers';
import { useLatestMessage, useLatestMessageId } from '~/hooks/Messages/useLatestMessage';
import Message from '~/components/Chat/Messages/Message';
import store from '~/store';

let mockHoverButtonsRenderCount = 0;

jest.mock('~/components/Chat/Messages/HoverButtons', () => ({
  __esModule: true,
  default: () => {
    mockHoverButtonsRenderCount += 1;
    return <div data-testid="hover-buttons" />;
  },
}));

jest.mock('~/components/Chat/Messages/Content/MessageContent', () => ({
  __esModule: true,
  default: ({ text }: { text: string }) => <div data-testid="message-content">{text}</div>,
}));

jest.mock('~/components/Chat/Messages/MessageIcon', () => ({
  __esModule: true,
  default: () => <div data-testid="message-icon" />,
}));

jest.mock('~/components/Chat/Messages/ui/PlaceholderRow', () => ({
  __esModule: true,
  default: () => <div data-testid="placeholder-row" />,
}));

jest.mock('~/hooks', () => {
  const useMessageProcess = jest.requireActual('~/hooks/Messages/useMessageProcess').default;
  const useMemoizedChatContext = jest.requireActual(
    '~/hooks/Messages/useMemoizedChatContext',
  ).default;
  return {
    useMessageProcess,
    useMemoizedChatContext,
    useContentMetadata: () => ({ hasParallelContent: false }),
    useLocalize: () => (key: string) => key,
    useMessageActions: ({
      chatContext,
      message,
    }: {
      chatContext: {
        ask: jest.Mock;
        index: number;
        regenerate: jest.Mock;
        conversation: TConversation | null;
        latestMessageId: string | undefined;
        latestMessageDepth: number | undefined;
        handleContinue: jest.Mock;
      };
      message?: TMessage;
    }) => ({
      ask: chatContext.ask,
      edit: false,
      index: chatContext.index,
      agent: undefined,
      assistant: undefined,
      conversation: chatContext.conversation,
      messageLabel: message?.sender ?? 'Assistant',
      handleFeedback: jest.fn(),
      handleContinue: chatContext.handleContinue,
      copyToClipboard: jest.fn(),
      latestMessageId: chatContext.latestMessageId,
      regenerateMessage: jest.fn(),
      latestMessageDepth: chatContext.latestMessageDepth,
    }),
  };
});

const conversation = {
  conversationId: 'conversation-streaming',
  endpoint: 'openAI',
  model: 'gpt-4',
} as TConversation;

const userMessage = {
  messageId: 'user-message',
  parentMessageId: '00000000-0000-0000-0000-000000000000',
  conversationId: conversation.conversationId,
  text: 'Tell me something',
  isCreatedByUser: true,
} as TMessage;

const optimisticAssistantMessage = {
  messageId: 'assistant-message_',
  parentMessageId: userMessage.messageId,
  conversationId: conversation.conversationId,
  sender: 'Assistant',
  text: '',
  isCreatedByUser: false,
} as TMessage;

const canonicalAssistantMessage = {
  ...optimisticAssistantMessage,
  messageId: 'assistant-message',
  text: 'Streaming canonical response',
} as TMessage;

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function DerivedStreamingRow() {
  const queryClient = useQueryClient();
  const latestMessage = useLatestMessage(0);
  const latestMessageId = useLatestMessageId(0);
  const latestMessageDepth = latestMessage?.depth;

  const chatContext = useMemo(
    () =>
      ({
        ask: jest.fn(),
        index: 0,
        regenerate: jest.fn(),
        conversation,
        latestMessageId: latestMessageId ?? undefined,
        latestMessageDepth,
        handleContinue: jest.fn(),
        isSubmitting: true,
        abortScroll: false,
        setAbortScroll: jest.fn(),
        getMessages: () =>
          queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversation.conversationId]),
        setMessages: (messages: TMessage[]) => {
          queryClient.setQueryData<TMessage[]>(
            [QueryKeys.messages, conversation.conversationId],
            messages,
          );
        },
      }) as unknown as ReturnType<typeof useChatContext>,
    [latestMessageDepth, latestMessageId, queryClient],
  );

  if (!latestMessage) {
    return null;
  }

  return (
    <ChatContext.Provider value={chatContext}>
      <MessagesViewProvider>
        <Message message={latestMessage} currentEditId={null} setCurrentEditId={jest.fn()} />
      </MessagesViewProvider>
    </ChatContext.Provider>
  );
}

function renderStreamingRow() {
  const queryClient = createQueryClient();
  queryClient.setQueryData<TMessage[]>(
    [QueryKeys.messages, conversation.conversationId],
    [userMessage, optimisticAssistantMessage],
  );

  const initializeState = ({ set }: MutableSnapshot) => {
    set(store.conversationByIndex(0), conversation);
    set(store.isSubmittingFamily(0), true);
  };

  render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot initializeState={initializeState}>
        <MemoryRouter initialEntries={[`/c/${conversation.conversationId}`]}>
          <DerivedStreamingRow />
        </MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );

  return queryClient;
}

describe('streaming hover actions', () => {
  beforeEach(() => {
    mockHoverButtonsRenderCount = 0;
  });

  it('does not mount hover actions while an optimistic assistant row is replaced', async () => {
    const user = userEvent.setup();
    const queryClient = renderStreamingRow();

    await user.hover(screen.getByTestId('message-content'));

    expect(screen.queryByTestId('hover-buttons')).toBeNull();
    expect(mockHoverButtonsRenderCount).toBe(0);

    act(() => {
      queryClient.setQueryData<TMessage[]>(
        [QueryKeys.messages, conversation.conversationId],
        [userMessage, canonicalAssistantMessage],
      );
    });

    expect(screen.queryByTestId('hover-buttons')).toBeNull();
    expect(mockHoverButtonsRenderCount).toBe(0);
    expect(screen.getByTestId('placeholder-row')).toBeInTheDocument();
  });
});
