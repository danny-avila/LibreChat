import { renderHook, act } from '@testing-library/react';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type { TConversation, TMessage, TSubmission } from 'librechat-data-provider';
import useChatFunctions from '../useChatFunctions';

const mockNavigate = jest.fn();
const mockSetShowStopButton = jest.fn();
const mockSetIsSubmitting = jest.fn();
const mockGetEphemeralAgent = jest.fn(() => null);
const mockSetFilesToDelete = jest.fn();
const mockGetSender = jest.fn(() => 'Assistant');
const mockGetExpiry = jest.fn(() => 'expiry-key');
const mockGetQueryData = jest.fn(() => ({}));
const mockLoggerWarn = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: mockGetQueryData,
  }),
}));

jest.mock('recoil', () => ({
  useRecoilValue: () => false,
  useSetRecoilState: (atom: unknown) =>
    String(atom).includes('isSubmitting') ? mockSetIsSubmitting : mockSetShowStopButton,
  useRecoilCallback: (factory: any) =>
    factory({
      snapshot: {
        getLoadable: () => ({ state: 'hasValue', contents: [] }),
      },
      set: jest.fn(),
      reset: jest.fn(),
    }),
}));

jest.mock('~/hooks/Files/useSetFilesToDelete', () => () => mockSetFilesToDelete);
jest.mock('~/hooks/Conversations/useGetSender', () => () => mockGetSender);
jest.mock('~/hooks/Input/useUserKey', () => () => ({ getExpiry: mockGetExpiry }));
jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: null }),
}));
jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    isTemporary: 'isTemporary',
    isSubmittingFamily: () => 'isSubmitting',
    showStopButtonByIndex: () => 'showStopButton',
    pendingManualSkillsByConvoId: () => 'pendingManualSkills',
    pendingQuotesByConvoId: () => 'pendingQuotes',
    messagesSiblingIdxFamily: () => 'messagesSiblingIdx',
  },
  useGetEphemeralAgent: () => mockGetEphemeralAgent,
}));
jest.mock('~/utils', () => ({
  logger: {
    log: jest.fn(),
    dir: jest.fn(),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
  },
  createDualMessageContent: jest.fn(() => []),
  getRouteChatProjectId: jest.fn(() => null),
}));

const userMessage = (messageId: string, parentMessageId = '00000000-0000-0000-0000-000000000000') =>
  ({
    messageId,
    parentMessageId,
    conversationId: 'conversation-1',
    isCreatedByUser: true,
    sender: 'User',
    text: messageId,
  }) as TMessage;

const assistantMessage = (messageId: string, parentMessageId: string) =>
  ({
    messageId,
    parentMessageId,
    conversationId: 'conversation-1',
    isCreatedByUser: false,
    sender: 'Assistant',
    text: messageId,
  }) as TMessage;

const conversation = (conversationId: string) =>
  ({
    conversationId,
    endpoint: EModelEndpoint.agents,
    model: 'gpt-4o',
    agent_id: 'agent-1',
  }) as TConversation;

function renderAsk(messages: TMessage[] | undefined, conversationId = 'conversation-1') {
  const setMessages = jest.fn();
  const setSubmission = jest.fn();
  const getMessages = jest.fn(() => messages);
  const hook = renderHook(() =>
    useChatFunctions({
      isSubmitting: false,
      latestMessage: messages?.at(-1) ?? null,
      conversation: conversation(conversationId),
      getMessages,
      setMessages,
      setSubmission,
    }),
  );

  return { ...hook, getMessages, setMessages, setSubmission };
}

describe('useChatFunctions ask', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetQueryData.mockReturnValue({});
  });

  it('refuses to send to an existing conversation before its history loads', () => {
    const { result, getMessages, setMessages, setSubmission } = renderAsk(undefined);

    let askResult: ReturnType<typeof result.current.ask>;
    act(() => {
      askResult = result.current.ask({ text: 'Hello', conversationId: 'conversation-1' });
    });

    expect(askResult!).toBe(false);
    expect(getMessages).toHaveBeenCalledWith('conversation-1');
    expect(setMessages).not.toHaveBeenCalled();
    expect(setSubmission).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '[useChatFunctions] Refusing to send before existing conversation history loads',
    );
  });

  it('allows an existing conversation whose loaded history is empty', () => {
    const { result, setMessages, setSubmission } = renderAsk([]);

    act(() => {
      result.current.ask({ text: 'Hello', conversationId: 'conversation-1' });
    });

    expect(setMessages).toHaveBeenCalled();
    expect(setSubmission).toHaveBeenCalled();
  });

  it('allows a new conversation before its message cache exists', () => {
    const newConversationId = Constants.NEW_CONVO as string;
    const { result, setMessages, setSubmission } = renderAsk(undefined, newConversationId);

    act(() => {
      result.current.ask({ text: 'Hello', conversationId: newConversationId });
    });

    expect(setMessages).toHaveBeenCalled();
    expect(setSubmission).toHaveBeenCalled();
  });

  it('allows explicit override messages before the cache exists', () => {
    const { result, setMessages, setSubmission } = renderAsk(undefined);

    act(() => {
      result.current.ask(
        { text: 'Hello', conversationId: 'conversation-1' },
        { overrideMessages: [] },
      );
    });

    expect(setMessages).toHaveBeenCalled();
    expect(setSubmission).toHaveBeenCalled();
  });
});

describe('useChatFunctions regenerate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetQueryData.mockReturnValue({});
  });

  it('keys a non-tail regenerate to the selected assistant response', () => {
    let messages = [
      userMessage('user-1'),
      assistantMessage('assistant-1', 'user-1'),
      userMessage('user-2', 'assistant-1'),
      assistantMessage('assistant-2', 'user-2'),
      userMessage('user-3', 'assistant-2'),
      assistantMessage('assistant-3', 'user-3'),
    ];
    const setMessages = jest.fn((nextMessages: TMessage[]) => {
      messages = nextMessages;
    });
    const setSubmission = jest.fn();
    const conversation = {
      conversationId: 'conversation-1',
      endpoint: EModelEndpoint.agents,
      model: 'gpt-4o',
      agent_id: 'agent-1',
    } as TConversation;

    const { result } = renderHook(() =>
      useChatFunctions({
        isSubmitting: false,
        latestMessage: messages[5],
        conversation,
        getMessages: () => messages,
        setMessages,
        setSubmission,
      }),
    );

    act(() => {
      result.current.regenerate(messages[1]);
    });

    const submission = setSubmission.mock.calls.at(-1)?.[0] as TSubmission;
    expect(submission.userMessage.overrideParentMessageId).toBe('user-1');
    expect(submission.userMessage.responseMessageId).toBe('assistant-1_');
    expect(submission.initialResponse?.messageId).toBe('assistant-1_');
    expect(submission.initialResponse?.parentMessageId).toBe('user-1');
    expect(submission.messages.map((message) => message.messageId)).toEqual(['user-1']);
    expect(submission.regenerateMessages?.map((message) => message.messageId)).toEqual([
      'user-1',
      'assistant-1',
      'user-2',
      'assistant-2',
      'user-3',
      'assistant-3',
    ]);
    expect(
      setMessages.mock.calls.at(-1)?.[0].map((message: TMessage) => message.messageId),
    ).toEqual(['user-1', 'assistant-1_']);
    expect(messages.at(-1)?.messageId).toBe('assistant-1_');
  });
});
