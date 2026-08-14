import React, { useMemo } from 'react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { RecoilRoot, type MutableSnapshot } from 'recoil';
import { render, screen, act } from '@testing-library/react';
import { QueryKeys, type TConversation, type TMessage } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useLatestMessage, useLatestMessageId } from '~/hooks/Messages/useLatestMessage';
import { ChatContext, MessagesViewProvider, useChatContext } from '~/Providers';
import StructuredMessage from '~/components/Messages/MessageContent';
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

jest.mock('~/components/Chat/Messages/Content/ContentParts', () => ({
  __esModule: true,
  default: ({ content }: { content?: TMessage['content'] }) => (
    <div data-testid="structured-message-content">{JSON.stringify(content ?? [])}</div>
  ),
}));

jest.mock('~/components/Chat/Messages/Content/Parts/AuthorHeader', () => ({
  __esModule: true,
  default: () => <div data-testid="author-header" />,
}));

jest.mock('~/components/Chat/Messages/MessageIcon', () => ({
  __esModule: true,
  default: () => <div data-testid="message-icon" />,
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
    useAttachments: () => ({ attachments: [], searchResults: undefined }),
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

const optimisticStructuredAssistantMessage = {
  ...optimisticAssistantMessage,
  content: [{ type: 'text', text: '' }],
} as TMessage;

const canonicalStructuredAssistantMessage = {
  ...canonicalAssistantMessage,
  content: [{ type: 'text', text: 'Streaming structured response' }],
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

function DerivedStreamingRow({ structured = false }: { structured?: boolean }) {
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

  const MessageComponent = structured ? StructuredMessage : Message;
  return (
    <ChatContext.Provider value={chatContext}>
      <MessagesViewProvider>
        <MessageComponent
          message={latestMessage}
          currentEditId={null}
          setCurrentEditId={jest.fn()}
          siblingIdx={0}
          siblingCount={2}
          setSiblingIdx={jest.fn()}
        />
      </MessagesViewProvider>
    </ChatContext.Provider>
  );
}

function renderStreamingRow(structured = false) {
  const queryClient = createQueryClient();
  queryClient.setQueryData<TMessage[]>(
    [QueryKeys.messages, conversation.conversationId],
    [userMessage, structured ? optimisticStructuredAssistantMessage : optimisticAssistantMessage],
  );

  const initializeState = ({ set }: MutableSnapshot) => {
    set(store.conversationByIndex(0), conversation);
    set(store.isSubmittingFamily(0), true);
  };

  render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot initializeState={initializeState}>
        <MemoryRouter initialEntries={[`/c/${conversation.conversationId}`]}>
          <DerivedStreamingRow structured={structured} />
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

  it('keeps actions mounted while an optimistic assistant row is replaced', async () => {
    const user = userEvent.setup();
    const queryClient = renderStreamingRow();

    await user.hover(screen.getByTestId('message-content'));

    expect(screen.getByTestId('hover-buttons')).toBeInTheDocument();
    expect(mockHoverButtonsRenderCount).toBeGreaterThan(0);

    act(() => {
      queryClient.setQueryData<TMessage[]>(
        [QueryKeys.messages, conversation.conversationId],
        [userMessage, canonicalAssistantMessage],
      );
    });

    expect(screen.getByTestId('hover-buttons')).toBeInTheDocument();
    expect(mockHoverButtonsRenderCount).toBeGreaterThan(0);
  });

  it('keeps actions mounted for structured tool-capable responses', async () => {
    const user = userEvent.setup();
    const queryClient = renderStreamingRow(true);

    await user.hover(screen.getByTestId('structured-message-content'));

    expect(screen.getByTestId('hover-buttons')).toBeInTheDocument();

    act(() => {
      queryClient.setQueryData<TMessage[]>(
        [QueryKeys.messages, conversation.conversationId],
        [userMessage, canonicalStructuredAssistantMessage],
      );
    });

    expect(screen.getByTestId('hover-buttons')).toBeInTheDocument();
  });

  /**
   * Every other action is withheld from the row that is still generating, so an
   * always-visible retry counter would sit alone under a half-written answer. Both
   * response formats have to fade it the same way.
   */
  it.each([
    ['a plain text', false],
    ['a structured', true],
  ])('fades retry navigation to hover-only on %s streaming row', (_label, structured) => {
    renderStreamingRow(structured);

    expect(screen.getByRole('navigation', { name: 'com_ui_sibling_navigation' })).toHaveClass(
      '[@media(hover:hover)]:opacity-0',
    );
  });

  /**
   * The row that is still generating withholds every action, and a lone sibling
   * counter renders nothing, so its footer measures zero until the answer lands.
   * Reserving the height keeps the transcript still at the moment it does.
   */
  it.each([
    ['a plain text', false],
    ['a structured', true],
  ])('holds the footer height while %s response streams', (_label, structured) => {
    renderStreamingRow(structured);

    expect(screen.getByTestId('hover-buttons').parentElement).toHaveClass('min-h-[31px]');
  });
});
