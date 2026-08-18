import React from 'react';
import { render, screen } from '@testing-library/react';
import type { TConversation } from 'librechat-data-provider';
import ChatView from '../ChatView';

let mockConversation: Record<string, unknown> | null;
const mockSetConversation = jest.fn();
const mockUseGetConversationByIdQuery = jest.fn<
  { data: TConversation | undefined },
  [string, Record<string, unknown>?]
>(() => ({ data: undefined }));

jest.mock('react-router-dom', () => ({
  useParams: () => ({ conversationId: 'child-thread' }),
}));

jest.mock('recoil', () => ({
  useRecoilValue: () => false,
}));

jest.mock('react-hook-form', () => ({
  useForm: () => ({}),
}));

jest.mock('@librechat/client', () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

jest.mock('librechat-data-provider', () => ({
  Constants: { NEW_CONVO: 'new', SEARCH: 'search' },
  buildTree: ({ messages }: { messages: unknown[] }) => messages,
  isEphemeralAgentId: (agentId: string) => agentId.startsWith('ephemeral_'),
}));

jest.mock('librechat-data-provider/react-query', () => ({
  useGetConversationByIdQuery: (id: string, config?: Record<string, unknown>) =>
    mockUseGetConversationByIdQuery(id, config),
}));

jest.mock('~/hooks', () => ({
  useAddedResponse: () => ({}),
  useResumeOnLoad: jest.fn(),
  useAdaptiveSSE: jest.fn(),
  useQueueDrain: jest.fn(),
  useLocalize: () => (key: string) => key,
  useChatHelpers: () => ({
    conversation: mockConversation,
    setConversation: mockSetConversation,
    getMessages: jest.fn(),
    ask: jest.fn(),
  }),
}));

jest.mock('~/Providers', () => {
  const Passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  const Context = { Provider: Passthrough };
  return {
    ChatContext: Context,
    AddedChatContext: Context,
    ChatFormProvider: Passthrough,
    useFileMapContext: () => new Map(),
  };
});

jest.mock('~/data-provider', () => ({
  useGetMessagesByConvoId: () => ({
    data: [{ messageId: 'message-1' }],
    isLoading: false,
    isFetching: false,
  }),
}));

jest.mock('../Input/ConversationStarters', () => () => null);
jest.mock('../Messages/MessagesView', () => () => <div data-testid="messages" />);
jest.mock('../Presentation', () => ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
));
jest.mock('../Input/ChatForm', () => () => <div data-testid="chat-form" />);
jest.mock('../Landing', () => () => <div data-testid="landing" />);
jest.mock('../Footer', () => () => <div data-testid="footer" />);
jest.mock('../Header', () => ({ readOnly }: { readOnly?: boolean }) => (
  <div data-read-only={String(readOnly)} data-testid="header" />
));

jest.mock('~/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    submissionByIndex: jest.fn(),
    isSubmittingFamily: jest.fn(),
    centerFormOnLanding: {},
  },
}));

describe('ChatView child-thread execution identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetConversationByIdQuery.mockReturnValue({ data: undefined });
  });

  it('renders a child without a standalone identity as view-only', () => {
    mockConversation = {
      conversationId: 'child-thread',
      title: 'Graph child',
      subagentThread: {
        parentConversationId: 'parent-thread',
        userRunnable: false,
      },
    };

    render(<ChatView />);

    expect(screen.queryByTestId('chat-form')).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('com_ui_subagent_thread_read_only');
    expect(screen.getByTestId('header')).toHaveAttribute('data-read-only', 'true');
    expect(mockUseGetConversationByIdQuery.mock.calls.at(-1)?.[1]).toMatchObject({
      enabled: false,
    });
  });

  it('keeps a saved-agent child runnable by the user', () => {
    mockConversation = {
      conversationId: 'child-thread',
      title: 'Saved agent child',
      subagentThread: {
        parentConversationId: 'parent-thread',
        userRunnable: true,
      },
    };

    render(<ChatView />);

    expect(screen.getByTestId('chat-form')).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.getByTestId('header')).toHaveAttribute('data-read-only', 'false');
  });

  it('refreshes an open saved-agent child until detached settlement makes it writable', () => {
    mockConversation = {
      conversationId: 'child-thread',
      title: 'Running saved agent child',
      agent_id: 'saved-agent',
      subagentThread: {
        parentConversationId: 'parent-thread',
        userRunnable: false,
      },
    };
    const settledConversation = {
      ...mockConversation,
      subagentThread: {
        parentConversationId: 'parent-thread',
        userRunnable: true,
      },
    };
    mockUseGetConversationByIdQuery.mockReturnValue({
      data: settledConversation as TConversation,
    });

    render(<ChatView />);

    expect(mockUseGetConversationByIdQuery.mock.calls.at(-1)?.[1]).toMatchObject({
      enabled: true,
      refetchOnMount: true,
    });
    expect(mockSetConversation).toHaveBeenCalledWith(settledConversation);
  });
});
